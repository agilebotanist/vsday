import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { findInstalledTheme, isThemeInstalled } from '../../appearanceController';
import { SEPIA_HC_THEME, SEPIA_THEME, WARM_DARK_THEME } from '../../appearanceModes';
import { VSDayApi } from '../../extension';
import { activateExtension, read, readUserValue, resetSettings, write } from './support';

/** The `uiTheme` of whatever theme is currently applied: vs, vs-dark, hc-light, hc-black. */
function currentThemeKind(): string | undefined {
  return findInstalledTheme(read<string>('workbench.colorTheme') ?? '')?.uiTheme;
}

describe('Appearance modes end to end', () => {
  let api: VSDayApi;

  before(async () => {
    api = await activateExtension();
  });

  beforeEach(async () => {
    await api.appearance.reset();
    await resetSettings();
  });

  after(async () => {
    await api.appearance.reset();
    await resetSettings();
  });

  it('ships three themes and finds them all (FR-9)', () => {
    assert.ok(isThemeInstalled(SEPIA_THEME));
    assert.ok(isThemeInstalled(WARM_DARK_THEME));
    assert.ok(isThemeInstalled(SEPIA_HC_THEME));
    assert.ok(!isThemeInstalled('Definitely Not Installed'));
    assert.ok(!isThemeInstalled(''));
  });

  it('resolves a real theme for every mode on this VS Code version (FR-16)', () => {
    // Guards the fallback chain: VS Code has renamed its default themes across releases,
    // so "the theme this mode would apply" must be something actually installed here.
    for (const mode of ['day', 'night', 'eyeSaving', 'highContrast'] as const) {
      const theme = api.appearance.themeFor(mode);
      assert.ok(theme.length > 0, `${mode} resolved no theme`);
      assert.ok(isThemeInstalled(theme), `${mode} resolved "${theme}", which is not installed`);
    }
  });

  it('applies a dark theme in Night mode (FR-10)', async () => {
    await api.appearance.applyMode('night', { interactive: false });

    assert.equal(currentThemeKind(), 'vs-dark');
    assert.equal(read<string>('vsday.mode.active'), 'night');
  });

  it('applies a light theme in Day mode (FR-10)', async () => {
    await api.appearance.applyMode('day', { interactive: false });

    assert.equal(currentThemeKind(), 'vs');
    assert.equal(read<string>('vsday.mode.active'), 'day');
  });

  it('applies the bundled warm theme and comfort settings in Eye-Saving mode (FR-10, FR-11)', async () => {
    await api.appearance.applyMode('eyeSaving', { interactive: false });

    assert.equal(read<string>('workbench.colorTheme'), SEPIA_THEME);
    assert.equal(read<number>('editor.lineHeight'), 1.6);
    assert.equal(read<string>('editor.cursorBlinking'), 'solid');
    assert.equal(read<string>('vsday.mode.active'), 'eyeSaving');
  });

  it('applies the warm high-contrast theme and heavier text in High Contrast mode (FR-17)', async () => {
    await api.appearance.applyMode('highContrast', { interactive: false });

    assert.equal(read<string>('workbench.colorTheme'), SEPIA_HC_THEME);
    assert.equal(currentThemeKind(), 'hc-light', 'must register as a high-contrast theme');
    assert.equal(read<string>('editor.fontWeight'), '600');
    assert.equal(read<number>('editor.cursorWidth'), 3);
    assert.equal(read<string>('vsday.mode.active'), 'highContrast');
  });

  it('swaps cleanly between the two warm modes, leaking no settings (FR-11, FR-17)', async () => {
    await api.appearance.applyMode('eyeSaving', { interactive: false });
    await api.appearance.applyMode('highContrast', { interactive: false });

    // Eye-Saving's overrides are gone, High Contrast's are in place.
    assert.equal(readUserValue<number>('editor.lineHeight'), undefined);
    assert.equal(readUserValue<string>('editor.fontWeight'), '600');

    await api.appearance.applyMode('eyeSaving', { interactive: false });

    assert.equal(readUserValue<string>('editor.fontWeight'), undefined);
    assert.equal(readUserValue<number>('editor.cursorWidth'), undefined);
    assert.equal(readUserValue<number>('editor.lineHeight'), 1.6);
  });

  it('reverts a mode’s comfort settings when leaving it (FR-11)', async () => {
    await api.appearance.applyMode('eyeSaving', { interactive: false });
    assert.equal(readUserValue<number>('editor.lineHeight'), 1.6);

    await api.appearance.applyMode('day', { interactive: false });

    assert.equal(readUserValue<number>('editor.lineHeight'), undefined);
    assert.equal(readUserValue<string>('editor.cursorBlinking'), undefined);
  });

  it('gives back a value the user had set themselves, not VS Code’s default (FR-11)', async () => {
    await write('editor.lineHeight', 1.35);

    await api.appearance.applyMode('eyeSaving', { interactive: false });
    assert.equal(read<number>('editor.lineHeight'), 1.6);

    await api.appearance.reset();
    assert.equal(read<number>('editor.lineHeight'), 1.35);
  });

  it('cycles through the configured order (FR-10)', async () => {
    await write('vsday.mode.cycleOrder', ['day', 'night', 'highContrast']);

    assert.equal(await api.appearance.cycle({ interactive: false }), 'day');
    assert.equal(await api.appearance.cycle({ interactive: false }), 'night');
    assert.equal(await api.appearance.cycle({ interactive: false }), 'highContrast');
    assert.equal(await api.appearance.cycle({ interactive: false }), 'day');
  });

  it('clears the mode without touching the theme (FR-12)', async () => {
    await api.appearance.applyMode('night', { interactive: false });
    const themeAfterNight = read<string>('workbench.colorTheme');

    await api.appearance.reset();

    assert.equal(read<string>('vsday.mode.active'), 'none');
    assert.equal(read<string>('workbench.colorTheme'), themeAfterNight);
  });

  it('keeps the current theme when a mode names one that is not installed', async () => {
    await api.appearance.applyMode('night', { interactive: false });
    const themeAfterNight = read<string>('workbench.colorTheme');
    await write('vsday.mode.day.theme', 'Definitely Not Installed');

    await api.appearance.applyMode('day', { interactive: false });

    assert.equal(read<string>('workbench.colorTheme'), themeAfterNight);
    assert.equal(read<string>('vsday.mode.active'), 'day');
  });

  it('honours an explicitly configured theme over the automatic choice', async () => {
    await write('vsday.mode.night.theme', WARM_DARK_THEME);

    await api.appearance.applyMode('night', { interactive: false });

    assert.equal(read<string>('workbench.colorTheme'), WARM_DARK_THEME);
  });

  it('refuses to let a mode override the settings VSDay manages (FR-12)', async () => {
    await write('vsday.mode.day.settings', {
      'editor.fontSize': 30,
      'window.zoomLevel': 3,
      'editor.wordWrap': 'on',
    });

    await api.appearance.applyMode('day', { interactive: false });

    assert.equal(readUserValue<number>('editor.fontSize'), undefined);
    assert.equal(readUserValue<number>('window.zoomLevel'), undefined);
    assert.equal(read<string>('editor.wordWrap'), 'on');

    await api.appearance.reset();
    assert.equal(readUserValue<string>('editor.wordWrap'), undefined);
  });

  it('resets font size and mode together (FR-15)', async () => {
    await vscode.commands.executeCommand('vsday.increaseFontSize');
    await api.appearance.applyMode('eyeSaving', { interactive: false });

    await vscode.commands.executeCommand('vsday.resetAll');

    assert.equal(read<number>('vsday.fontScale.step'), 0);
    assert.equal(read<string>('vsday.mode.active'), 'none');
    assert.equal(readUserValue<number>('editor.lineHeight'), undefined);
  });

  it('cycles to the next mode when the status bar mode button is clicked (FR-21)', async () => {
    await write('vsday.mode.cycleOrder', ['day', 'night', 'eyeSaving']);
    api.statusBar.refresh(api.fontScale.state(), api.appearance.activeMode());

    const button = api.statusBar.snapshot();
    assert.equal(button.modeVisible, true);
    assert.equal(button.commands['vsday.mode'], 'vsday.cycleAppearanceMode');
    assert.ok(button.modeText.includes('Mode'), `with no mode active: "${button.modeText}"`);

    // Each click moves one step along the cycle, and the button says where you are.
    for (const expected of ['Day', 'Night', 'Eye-Saving', 'Day']) {
      await vscode.commands.executeCommand(button.commands['vsday.mode'] as string);
      const text = api.statusBar.snapshot().modeText;
      assert.ok(text.includes(expected), `expected "${expected}" in mode button, got "${text}"`);
    }
  });

  it('honours vsday.statusBar.showModeButton (FR-21)', async () => {
    await write('vsday.statusBar.showModeButton', false);
    api.statusBar.refresh(api.fontScale.state(), api.appearance.activeMode());

    assert.equal(api.statusBar.snapshot().modeVisible, false);
  });

  it('exposes a command per mode (FR-14)', async () => {
    await vscode.commands.executeCommand('vsday.setHighContrastMode');
    assert.equal(read<string>('vsday.mode.active'), 'highContrast');

    await vscode.commands.executeCommand('vsday.setDayMode');
    assert.equal(read<string>('vsday.mode.active'), 'day');
  });
});
