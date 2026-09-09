import * as vscode from 'vscode';
import {
  ActiveMode,
  MODE_DESCRIPTORS,
  ModeId,
  THEME_FALLBACKS,
  TrackedOriginals,
  computeOverrideReset,
  computeOverrideTransition,
  isModeId,
  nextMode,
  partitionOverrides,
} from './appearanceModes';
import { CONFIG, STATE_MODE_ORIGINALS, modeSettingsKey, modeThemeKey } from './config';
import { Logger } from './logging';
import { SettingsService } from './settingsService';

export interface ApplyModeOptions {
  /** When false, no dialogs are shown — used by tests and by startup reconciliation. */
  readonly interactive?: boolean;
}

/**
 * Applies appearance modes: a colour theme plus revertible comfort settings.
 */
export class AppearanceController {
  constructor(
    private readonly settings: SettingsService,
    private readonly state: vscode.Memento,
    private readonly logger: Logger,
    /** Settings the font scaler owns, which a mode is not allowed to override. */
    private readonly reservedFontSettings: () => string[]
  ) {}

  activeMode(): ActiveMode {
    const value = this.settings.get<string>(CONFIG.activeMode);
    return isModeId(value) ? value : 'none';
  }

  /**
   * The theme a mode will apply: whatever the user configured, or — when that is empty —
   * the best installed candidate for the mode. See `THEME_FALLBACKS` for why a list beats
   * a hardcoded name.
   */
  themeFor(id: ModeId): string {
    const configured = this.settings.getOr<string>(modeThemeKey(id), '').trim();
    if (configured.length > 0) {
      return configured;
    }
    return firstInstalledTheme(THEME_FALLBACKS[id]) ?? '';
  }

  async cycle(options?: ApplyModeOptions): Promise<ModeId> {
    const order = this.settings.get<unknown[]>(CONFIG.cycleOrder);
    const target = nextMode(order, this.activeMode());
    await this.applyMode(target, options);
    return target;
  }

  async applyMode(id: ModeId, options?: ApplyModeOptions): Promise<void> {
    const interactive = options?.interactive !== false;
    const theme = this.themeFor(id);

    if (interactive && !(await this.confirmAutoDetectColorScheme())) {
      this.logger.info(`Mode ${id} cancelled by the user at the auto-detect prompt`);
      return;
    }

    await this.applyOverrides(id);

    if (theme.length === 0) {
      this.logger.warn(`Mode ${id} has no theme configured; only its settings were applied`);
    } else if (isThemeInstalled(theme)) {
      await this.settings.update(CONFIG.colorTheme, theme);
    } else {
      this.logger.warn(`Theme "${theme}" is not installed; leaving the current theme in place`);
      if (interactive) {
        void this.offerThemePicker(id, theme);
      }
    }

    await this.settings.update(CONFIG.activeMode, id);
    this.logger.info(`Applied ${MODE_DESCRIPTORS[id].label} mode (theme: ${theme || 'none'})`);
  }

  /** Reverts the current mode's overrides and clears the active mode; keeps the theme. */
  async reset(): Promise<void> {
    const tracked = this.state.get<TrackedOriginals>(STATE_MODE_ORIGINALS);
    const transition = computeOverrideReset(tracked);

    for (const restore of transition.restores) {
      await this.write(restore.key, restore.value);
    }

    await this.state.update(STATE_MODE_ORIGINALS, {});
    await this.settings.update(CONFIG.activeMode, 'none');
    this.logger.info(`Cleared appearance mode; reverted ${transition.restores.length} override(s)`);
  }

  private async applyOverrides(id: ModeId): Promise<void> {
    const declared = this.settings.get<Record<string, unknown>>(modeSettingsKey(id));
    const { accepted, rejected } = partitionOverrides(declared, this.reservedFontSettings());

    if (rejected.length > 0) {
      this.logger.warn(
        `Mode ${id} declares settings VSDay manages itself; ignoring: ${rejected.join(', ')}`
      );
    }

    const tracked = this.state.get<TrackedOriginals>(STATE_MODE_ORIGINALS);
    const transition = computeOverrideTransition(tracked, accepted, (key) =>
      this.settings.getUserValue(key)
    );

    // Restores first: the outgoing mode's keys are disjoint from the incoming mode's, so
    // ordering only matters for keeping settings.json churn minimal.
    for (const restore of transition.restores) {
      await this.write(restore.key, restore.value);
    }
    for (const apply of transition.applies) {
      await this.write(apply.key, apply.value);
    }

    await this.state.update(STATE_MODE_ORIGINALS, transition.nextOriginals);
  }

  private async write(key: string, value: unknown): Promise<void> {
    if (!this.settings.isRegistered(key)) {
      this.logger.warn(`Skipping unregistered setting: ${key}`);
      return;
    }
    try {
      await this.settings.update(key, value);
    } catch (error) {
      this.logger.error(`Failed to write ${key}`, error);
    }
  }

  /**
   * `window.autoDetectColorScheme` makes VS Code pick the theme from the OS, which
   * silently overrides anything we write to `workbench.colorTheme`. Rather than appear
   * broken, say so and offer to turn it off.
   */
  private async confirmAutoDetectColorScheme(): Promise<boolean> {
    if (this.settings.get<boolean>(CONFIG.autoDetectColorScheme) !== true) {
      return true;
    }

    const disable = 'Disable and continue';
    const anyway = 'Apply anyway';
    const choice = await vscode.window.showWarningMessage(
      'VS Code is following the OS colour scheme (window.autoDetectColorScheme), which overrides the theme VSDay sets.',
      { modal: true },
      disable,
      anyway
    );

    if (choice === disable) {
      await this.settings.update(CONFIG.autoDetectColorScheme, false);
      return true;
    }
    return choice === anyway;
  }

  private async offerThemePicker(id: ModeId, missingTheme: string): Promise<void> {
    const pick = 'Choose Theme…';
    const choice = await vscode.window.showWarningMessage(
      `VSDay ${MODE_DESCRIPTORS[id].label} mode is set to the theme "${missingTheme}", which is not installed.`,
      pick
    );
    if (choice === pick) {
      await vscode.commands.executeCommand('workbench.action.selectTheme');
    }
  }
}

export interface InstalledTheme {
  readonly label: string;
  readonly id?: string;
  /** `vs`, `vs-dark`, `hc-black` or `hc-light`. */
  readonly uiTheme?: string;
}

/**
 * Looks a theme up among all installed contributions.
 *
 * `workbench.colorTheme` accepts a theme's `id` when it declares one and its `label`
 * otherwise, so both are matched. Built-in themes carry unresolved NLS placeholders
 * (`%darkModernThemeLabel%`) in the manifest we can read here, which is exactly why
 * matching by `id` matters. Theme contributions are static package.json data, so no
 * extension has to be activated to see them.
 */
export function findInstalledTheme(nameOrId: string): InstalledTheme | undefined {
  const wanted = nameOrId.trim();
  if (wanted.length === 0) {
    return undefined;
  }

  for (const extension of vscode.extensions.all) {
    const themes = extension.packageJSON?.contributes?.themes;
    if (!Array.isArray(themes)) {
      continue;
    }
    for (const theme of themes) {
      if (theme?.label === wanted || theme?.id === wanted) {
        return { label: theme.label, id: theme.id, uiTheme: theme.uiTheme };
      }
    }
  }
  return undefined;
}

export function isThemeInstalled(nameOrId: string): boolean {
  return findInstalledTheme(nameOrId) !== undefined;
}

/** The first candidate that is actually installed, or `undefined` if none are. */
export function firstInstalledTheme(candidates: readonly string[]): string | undefined {
  return candidates.find((candidate) => isThemeInstalled(candidate));
}
