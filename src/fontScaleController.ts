import { CONFIG, DEFAULTS } from './config';
import {
  clampStep,
  computeFontWrites,
  resolveBaseline,
  scalePercentLabel,
  scaledSize,
  zoomLevelForStep,
} from './fontScale';
import { EDITOR_FONT_SIZE, FontTarget, WINDOW_ZOOM_LEVEL, resolveFontTargets } from './fontTargets';
import { Logger } from './logging';
import { SettingsService } from './settingsService';

export interface FontScaleState {
  readonly step: number;
  readonly percentLabel: string;
  readonly editorFontSize: number;
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

    const writes = computeFontWrites({ targets, baselines, ratio, step });
    for (const write of writes) {
      await this.writeSetting(write.setting, write.value, write.baselineFallback);
    }

    await this.applyZoom(baselines, step);
    await this.settings.update(CONFIG.step, step);

    this.logger.info(
      `Applied step ${step} (${scalePercentLabel(ratio, step)}) to ${writes.length} setting(s)`
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
    step: number
  ): Promise<void> {
    const enabled = this.settings.getOr<boolean>(CONFIG.uiZoomEnabled, DEFAULTS.uiZoomEnabled);
    const perStep = this.settings.getOr<number>(CONFIG.uiZoomPerStep, DEFAULTS.uiZoomPerStep);
    const baseline = baselines[WINDOW_ZOOM_LEVEL] ?? 0;

    const level = zoomLevelForStep(baseline, step, perStep, enabled);
    if (level === undefined) {
      return;
    }
    await this.writeSetting(WINDOW_ZOOM_LEVEL, level);
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
    const baselines = this.storedBaselines();
    const baseline = baselines[EDITOR_FONT_SIZE];
    const editorFontSize =
      typeof baseline === 'number'
        ? scaledSize(baseline, ratio, step, 4, 100)
        : (this.settings.get<number>(EDITOR_FONT_SIZE) ?? 14);

    return { step, percentLabel: scalePercentLabel(ratio, step), editorFontSize };
  }
}
