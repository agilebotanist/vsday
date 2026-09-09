import { CONFIG, DEFAULTS } from './config';
import {
  ScaleStrategy,
  clampStep,
  computeFontWrites,
  resolveBaseline,
  scalePercentLabel,
  scaledSize,
  zoomLevelForStep,
  zoomPerStepForRatio,
} from './fontScale';
import { EDITOR_FONT_SIZE, FontTarget, WINDOW_ZOOM_LEVEL, resolveFontTargets } from './fontTargets';
import { Logger } from './logging';
import { SettingsService } from './settingsService';

export interface FontScaleState {
  readonly step: number;
  readonly percentLabel: string;
  readonly editorFontSize: number;
  readonly strategy: ScaleStrategy;
}

/**
 * Owns the font scale: capturing baselines, and writing every target's size for a step.
 *
 * All writes land in User (Global) settings, so one keypress reaches every open window.
 */
export class FontScaleController {
  constructor(
    private readonly settings: SettingsService,
    private readonly logger: Logger
  ) {}

  /** Built-in targets plus the user's extras, restricted to settings that actually exist. */
  targets(): FontTarget[] {
    const extras = this.settings.getOr<string[]>(CONFIG.extraTargets, []);
    const resolved = resolveFontTargets(extras);
    const available: FontTarget[] = [];

    for (const target of resolved) {
      if (this.settings.isRegistered(target.setting)) {
        available.push(target);
      } else {
        // Happens for settings owned by an uninstalled extension, and for built-ins that
        // a given VS Code version does not have yet. Writing one would throw.
        this.logger.warn(`Skipping unregistered setting: ${target.setting}`);
      }
    }

    return available;
  }

  currentStep(): number {
    return clampStep(this.settings.getOr<number>(CONFIG.step, 0));
  }

  private ratio(): number {
    const ratio = this.settings.getOr<number>(CONFIG.ratio, DEFAULTS.ratio);
    return Number.isFinite(ratio) && ratio > 1 ? ratio : DEFAULTS.ratio;
  }

  strategy(): ScaleStrategy {
    return this.settings.getOr<string>(CONFIG.scaleStrategy, DEFAULTS.scaleStrategy) === 'textFirst'
      ? 'textFirst'
      : 'uniform';
  }

  /** Flips between the two strategies and re-applies the current step under the new one. */
  async toggleStrategy(): Promise<ScaleStrategy> {
    const next: ScaleStrategy = this.strategy() === 'uniform' ? 'textFirst' : 'uniform';
    await this.settings.update(CONFIG.scaleStrategy, next);
    await this.applyStep(this.currentStep());
    return next;
  }

  private storedBaselines(): Record<string, number> {
    const raw = this.settings.getOr<Record<string, unknown>>(CONFIG.baselines, {});
    const baselines: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw ?? {})) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        baselines[key] = value;
      }
    }
    return baselines;
  }

  /**
   * Baselines for every target, capturing any that are missing from the user's current
   * configuration.
   *
   * A target we have never scaled still holds the user's own size, so reading it now is
   * exactly right. A target we *have* scaled already has a baseline recorded and is left
   * alone — re-reading it would capture our own scaled value as the new 100%.
   */
  async ensureBaselines(targets: readonly FontTarget[]): Promise<Record<string, number>> {
    const baselines = this.storedBaselines();
    let dirty = false;

    for (const target of targets) {
      if (target.setting in baselines) {
        continue;
      }
      const baseline = resolveBaseline(this.settings.get(target.setting), target);
      if (baseline !== undefined) {
        baselines[target.setting] = baseline;
        dirty = true;
      }
    }

    if (!(WINDOW_ZOOM_LEVEL in baselines)) {
      const zoom = this.settings.get<number>(WINDOW_ZOOM_LEVEL);
      baselines[WINDOW_ZOOM_LEVEL] = typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : 0;
      dirty = true;
    }

    if (dirty) {
      await this.settings.update(CONFIG.baselines, baselines);
      this.logger.info(`Captured baselines: ${JSON.stringify(baselines)}`);
    }

    return baselines;
  }

  /** Re-captures the currently effective sizes as the new 100% and returns to step 0. */
  async captureBaseline(): Promise<void> {
    const baselines: Record<string, number> = {};

    for (const target of this.targets()) {
      const baseline = resolveBaseline(this.settings.get(target.setting), target);
      if (baseline !== undefined) {
        baselines[target.setting] = baseline;
      }
    }

    const zoom = this.settings.get<number>(WINDOW_ZOOM_LEVEL);
    baselines[WINDOW_ZOOM_LEVEL] = typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : 0;

    await this.settings.update(CONFIG.baselines, baselines);
    await this.settings.update(CONFIG.step, 0);
    this.logger.info(`Re-captured baselines at step 0: ${JSON.stringify(baselines)}`);
  }

  async applyStep(requestedStep: number): Promise<number> {
    const step = clampStep(requestedStep);
    const targets = this.targets();
    const baselines = await this.ensureBaselines(targets);
    const ratio = this.ratio();

    // In `uniform` mode the fonts are still *written*, but at step 0 — that is what returns
    // them to the baseline (and, by the rule in writeSetting, removes the ones that match
    // their default) when switching strategies. Zoom then carries the whole scale.
    const strategy = this.strategy();
    const fontStep = strategy === 'uniform' ? 0 : step;

    const writes = computeFontWrites({ targets, baselines, ratio, step: fontStep });
    for (const write of writes) {
      await this.writeSetting(write.setting, write.value, write.baselineFallback);
    }

    await this.applyZoom(baselines, step, strategy, ratio);
    await this.settings.update(CONFIG.step, step);

    this.logger.info(
      `Applied step ${step} (${scalePercentLabel(ratio, step)}, ${strategy}) to ` +
        `${writes.length} setting(s)`
    );
    return step;
  }

  /**
   * Writes a size, or **removes** the setting when writing it would change nothing.
   *
   * "Changes nothing" means the value equals whatever the surface would use if the setting
   * carried no value: its registered default, or — for settings VS Code registers without
   * one, such as `chat.fontSize` — the size its consumers substitute, which the target
   * registry declares as `baselineFallback`.
   *
   * The effective result is identical either way, so removing is strictly better: a reset
   * hands every surface, VS Code's own and any extension's, back to its own default
   * instead of leaving VSDay's fingerprints pinned in settings.json.
   */
  private async writeSetting(
    key: string,
    value: number | undefined,
    baselineFallback?: number
  ): Promise<void> {
    const naturalValue = this.settings.getDefaultValue<number>(key) ?? baselineFallback;
    const redundant = value !== undefined && value === naturalValue;
    await this.settings.update(key, redundant ? undefined : value);
  }

  private async applyZoom(
    baselines: Readonly<Record<string, number>>,
    step: number,
    strategy: ScaleStrategy,
    ratio: number
  ): Promise<void> {
    const baseline = baselines[WINDOW_ZOOM_LEVEL] ?? 0;

    // `uniform` ignores both zoom settings: zoom *is* the scale here, and the per-step
    // amount is derived from `ratio` so a step feels the same under either strategy.
    if (strategy === 'uniform') {
      await this.writeSetting(
        WINDOW_ZOOM_LEVEL,
        zoomLevelForStep(baseline, step, zoomPerStepForRatio(ratio), true)
      );
      return;
    }

    const enabled = this.settings.getOr<boolean>(CONFIG.uiZoomEnabled, DEFAULTS.uiZoomEnabled);
    const perStep = this.settings.getOr<number>(CONFIG.uiZoomPerStep, DEFAULTS.uiZoomPerStep);

    const level = zoomLevelForStep(baseline, step, perStep, enabled);
    if (level === undefined) {
      return;
    }
    await this.writeSetting(WINDOW_ZOOM_LEVEL, level);
  }

  /**
   * Brings the settings into line with the current step and strategy, writing only if
   * something is actually out of line.
   *
   * Called on activation, where three things can have left the state half-applied: an
   * upgrade that added a target (a surface that has never been scaled), a strategy change
   * made by editing settings.json directly, and a hand-edited size. The cheap common case —
   * step 0, nothing pinned — writes nothing at all.
   */
  async reconcile(): Promise<boolean> {
    const step = this.currentStep();
    const targets = this.targets();
    const baselines = this.storedBaselines();
    const strategy = this.strategy();
    const ratio = this.ratio();

    if (step === 0 && Object.keys(baselines).length === 0) {
      return false;
    }

    const fontStep = strategy === 'uniform' ? 0 : step;
    const desired = computeFontWrites({ targets, baselines, ratio, step: fontStep });

    const drifted = desired.some((write) => {
      const natural =
        this.settings.getDefaultValue<number>(write.setting) ?? write.baselineFallback;
      const expected = write.value === natural ? undefined : write.value;
      return this.settings.getUserValue<number>(write.setting) !== expected;
    });

    if (!drifted) {
      return false;
    }

    this.logger.info(`Reconciling settings to step ${step} (${strategy})`);
    await this.applyStep(step);
    return true;
  }

  increase(): Promise<number> {
    return this.applyStep(this.currentStep() + 1);
  }

  decrease(): Promise<number> {
    return this.applyStep(this.currentStep() - 1);
  }

  reset(): Promise<number> {
    return this.applyStep(0);
  }

  /** Snapshot for the status bar and quick pick. */
  state(): FontScaleState {
    const step = this.currentStep();
    const ratio = this.ratio();
    const strategy = this.strategy();
    const baselines = this.storedBaselines();
    const baseline = baselines[EDITOR_FONT_SIZE];
    // Under `uniform` the font settings sit at their baseline and zoom does the work, so
    // the size reported here is the configured one, not the rendered one.
    const fontStep = strategy === 'uniform' ? 0 : step;
    const editorFontSize =
      typeof baseline === 'number'
        ? scaledSize(baseline, ratio, fontStep, 4, 100)
        : (this.settings.get<number>(EDITOR_FONT_SIZE) ?? 14);

    return { step, percentLabel: scalePercentLabel(ratio, step), editorFontSize, strategy };
  }
}
