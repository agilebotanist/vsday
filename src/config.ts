import { ModeId } from './appearanceModes';

/** Every setting key VSDay reads or writes, in one place. */
export const CONFIG = {
  scaleStrategy: 'vsday.scaleStrategy',
  step: 'vsday.fontScale.step',
  ratio: 'vsday.fontScale.ratio',
  baselines: 'vsday.fontScale.baselines',
  extraTargets: 'vsday.fontScale.extraTargets',
  uiZoomEnabled: 'vsday.uiZoom.enabled',
  uiZoomPerStep: 'vsday.uiZoom.perStep',
  activeMode: 'vsday.mode.active',
  cycleOrder: 'vsday.mode.cycleOrder',
  statusBarEnabled: 'vsday.statusBar.enabled',
  showResetDot: 'vsday.statusBar.showResetDot',
  showStepButtons: 'vsday.statusBar.showStepButtons',
  showModeButton: 'vsday.statusBar.showModeButton',
  colorTheme: 'workbench.colorTheme',
  autoDetectColorScheme: 'window.autoDetectColorScheme',
} as const;

/** Prefix that identifies a configuration change as ours to react to. */
export const CONFIG_ROOT = 'vsday';

export function modeThemeKey(id: ModeId): string {
  return `vsday.mode.${id}.theme`;
}

export function modeSettingsKey(id: ModeId): string {
  return `vsday.mode.${id}.settings`;
}

/** globalState key holding the pre-mode values of the settings a mode overrode. */
export const STATE_MODE_ORIGINALS = 'vsday.modeOverrideOriginals';

/** Defaults mirrored from package.json, used when a setting is somehow unreadable. */
export const DEFAULTS = {
  ratio: 1.1,
  uiZoomPerStep: 0.1,
  uiZoomEnabled: true,
  scaleStrategy: 'uniform',
} as const;
