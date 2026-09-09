import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { VSDayApi } from '../../extension';
import { activateExtension, clearModeState, read, resetSettings, write } from './support';

const EXPECTED_COMMANDS = [
  'vsday.increaseFontSize',
  'vsday.decreaseFontSize',
  'vsday.resetFontSize',
  'vsday.setFontScale',
  'vsday.captureBaseline',
  'vsday.setAppearanceMode',
  'vsday.cycleAppearanceMode',
  'vsday.setDayMode',
  'vsday.setNightMode',
  'vsday.setEyeSavingMode',
  'vsday.setHighContrastMode',
  'vsday.resetAll',
  'vsday.showMenu',
  'vsday.showLog',
];

describe('VSDay activation and contributions', () => {
  let api: VSDayApi;

  before(async () => {
    api = await activateExtension();
  });

  after(async () => {
    await clearModeState(api);
    await resetSettings();
  });

  it('activates and exposes its API (FR-14)', () => {
    assert.ok(api.fontScale);
    assert.ok(api.appearance);
    assert.ok(api.statusBar);
  });

  it('registers every contributed command (FR-14)', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const command of EXPECTED_COMMANDS) {
      assert.ok(commands.includes(command), `${command} should be registered`);
    }
  });

  it('contributes all three bundled themes (FR-9)', () => {
    const themes = vscode.extensions.getExtension('agilebotanist.vsday')?.packageJSON?.contributes
      ?.themes as { label: string; uiTheme: string }[];
    assert.deepEqual(themes.map((theme) => theme.label).sort(), [
      'VSDay Sepia (Warm Light)',
      'VSDay Sepia High Contrast',
      'VSDay Warm Dark',
    ]);
    assert.deepEqual(themes.map((theme) => theme.uiTheme).sort(), ['hc-light', 'vs', 'vs-dark']);
  });

  it('registers every font target as a real setting in this VS Code build (FR-7)', () => {
    // If VS Code ever renames one of these, targets() silently drops it — this test is
    // what turns that into a visible failure rather than a feature that quietly stops.
    const targets = api.fontScale.targets().map((target) => target.setting);
    for (const expected of [
      'editor.fontSize',
      'terminal.integrated.fontSize',
      'debug.console.fontSize',
      'markdown.preview.fontSize',
      'scm.inputFontSize',
      'notebook.output.fontSize',
      'chat.fontSize',
      'chat.editor.fontSize',
    ]) {
      assert.ok(targets.includes(expected), `${expected} should be registered and targeted`);
    }
  });

  it('does not clobber a font size the user set by hand before first use (FR-3)', async () => {
    await resetSettings();
    await write('editor.fontSize', 17);

    await vscode.commands.executeCommand('vsday.increaseFontSize');
    assert.ok(read<number>('editor.fontSize')! > 17);

    await vscode.commands.executeCommand('vsday.resetFontSize');
    assert.equal(read<number>('editor.fontSize'), 17);
  });
});
