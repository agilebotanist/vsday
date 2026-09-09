import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { VSDayApi } from '../../extension';

export const EXTENSION_ID = 'agilebotanist.vsday';

/** Settings the suite writes; wiped between tests so cases cannot bleed into each other. */
export const TOUCHED_SETTINGS = [
  'vsday.scaleStrategy',
  'vsday.fontScale.step',
  'vsday.fontScale.ratio',
  'vsday.fontScale.baselines',
  'vsday.fontScale.extraTargets',
  'vsday.uiZoom.enabled',
  'vsday.uiZoom.perStep',
  'vsday.mode.active',
  'vsday.mode.cycleOrder',
  'vsday.mode.day.theme',
  'vsday.mode.day.settings',
  'vsday.mode.night.theme',
  'vsday.mode.night.settings',
  'vsday.mode.eyeSaving.theme',
  'vsday.mode.eyeSaving.settings',
  'vsday.mode.highContrast.theme',
  'vsday.mode.highContrast.settings',
  'editor.fontWeight',
  'editor.cursorWidth',
  'window.autoDetectColorScheme',
  'vsday.statusBar.enabled',
  'vsday.statusBar.showResetDot',
  'vsday.statusBar.showStepButtons',
  'vsday.statusBar.showModeButton',
  'window.zoomLevel',
  'workbench.colorTheme',
  'editor.fontSize',
  'terminal.integrated.fontSize',
  'debug.console.fontSize',
  'markdown.preview.fontSize',
  'scm.inputFontSize',
  'chat.fontSize',
  'chat.editor.fontSize',
  'notebook.output.fontSize',
  'notebook.markup.fontSize',
  'editor.suggestFontSize',
  'editor.codeLens.fontSize',
  'editor.inlayHints.fontSize',
  'editor.lineHeight',
  'editor.cursorBlinking',
  'editor.renderLineHighlight',
];

export async function activateExtension(): Promise<VSDayApi> {
  const extension = vscode.extensions.getExtension<VSDayApi>(EXTENSION_ID);
  assert.ok(extension, `${EXTENSION_ID} should be present in the test host`);
  const api = await extension.activate();
  assert.ok(api, 'activate() should return the VSDay API');
  return api;
}

/** Returns every setting to its VS Code default at User scope. */
export async function resetSettings(): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  for (const key of TOUCHED_SETTINGS) {
    await config.update(key, undefined, vscode.ConfigurationTarget.Global);
  }
}

export function read<T>(key: string): T | undefined {
  return vscode.workspace.getConfiguration().get<T>(key);
}

export function readUserValue<T>(key: string): T | undefined {
  return vscode.workspace.getConfiguration().inspect<T>(key)?.globalValue;
}

export async function write(key: string, value: unknown): Promise<void> {
  await vscode.workspace.getConfiguration().update(key, value, vscode.ConfigurationTarget.Global);
}

/** Clears the mode override bookkeeping so each test starts from a known state. */
export async function clearModeState(api: VSDayApi): Promise<void> {
  await api.appearance.reset();
}
