import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { VSDayApi } from '../../extension';
import { activateExtension, read, readUserValue, resetSettings, write } from './support';

const SURFACES = [
  'editor.fontSize',
  'terminal.integrated.fontSize',
  'debug.console.fontSize',
  'markdown.preview.fontSize',
  'scm.inputFontSize',
];

describe('Font scaling end to end', () => {
  let api: VSDayApi;

  before(async () => {
    api = await activateExtension();
  });

  beforeEach(async () => {
    await resetSettings();
  });

  after(async () => {
    await resetSettings();
  });

  it('enlarges every surface at once, at User scope so all windows follow (FR-1, FR-4)', async () => {
    const before = SURFACES.map((key) => read<number>(key)!);

    await vscode.commands.executeCommand('vsday.increaseFontSize');

    SURFACES.forEach((key, index) => {
      const now = read<number>(key)!;
      assert.ok(now > before[index], `${key}: ${now} should exceed ${before[index]}`);
      // Written globally, not to the workspace — that is what reaches other windows.
      assert.equal(readUserValue<number>(key), now, `${key} should be a User-scope value`);
    });
  });

  it('shrinks every surface at once (FR-2)', async () => {
    const before = SURFACES.map((key) => read<number>(key)!);

    await vscode.commands.executeCommand('vsday.decreaseFontSize');

    SURFACES.forEach((key, index) => {
      assert.ok(read<number>(key)! < before[index], `${key} should shrink`);
    });
  });

  it('returns to the exact original sizes on reset (FR-3)', async () => {
    const before = Object.fromEntries(SURFACES.map((key) => [key, read<number>(key)!]));

    for (let i = 0; i < 4; i += 1) {
      await vscode.commands.executeCommand('vsday.increaseFontSize');
    }
    await vscode.commands.executeCommand('vsday.decreaseFontSize');
    await vscode.commands.executeCommand('vsday.resetFontSize');

    for (const key of SURFACES) {
      assert.equal(read<number>(key), before[key], `${key} should be restored`);
    }
    assert.equal(read<number>('vsday.fontScale.step'), 0);
  });

  it('nudges window.zoomLevel and gives it back on reset (FR-5)', async () => {
    for (let i = 0; i < 3; i += 1) {
      await vscode.commands.executeCommand('vsday.increaseFontSize');
    }
    assert.equal(read<number>('window.zoomLevel'), 0.3);

    await vscode.commands.executeCommand('vsday.resetFontSize');
    assert.equal(readUserValue<number>('window.zoomLevel'), undefined);
  });

  it('respects vsday.uiZoom.enabled = false (FR-5)', async () => {
    await write('vsday.uiZoom.enabled', false);

    await vscode.commands.executeCommand('vsday.increaseFontSize');

    assert.equal(readUserValue<number>('window.zoomLevel'), undefined);
  });

  it('leaves inheriting surfaces inheriting (FR-8)', async () => {
    // These settings mean "follow editor.fontSize" when they are 0 or unset — and some
    // have no default at all in a given VS Code version. Either way the requirement is
    // the same: VSDay must not pin a concrete number the user never chose.
    const inheriting = [
      'notebook.output.fontSize',
      'editor.suggestFontSize',
      'editor.codeLens.fontSize',
      'editor.inlayHints.fontSize',
    ];
    const before = Object.fromEntries(inheriting.map((key) => [key, read<number>(key)]));

    for (let i = 0; i < 3; i += 1) {
      await vscode.commands.executeCommand('vsday.increaseFontSize');
    }

    for (const key of inheriting) {
      assert.equal(read<number>(key), before[key], `${key} should be unchanged`);
      assert.equal(readUserValue<number>(key), undefined, `${key} should not be pinned`);
    }
  });

  it('scales chat body text, not only chat code blocks (FR-18)', async () => {
    // Chat webviews — the Claude Code panel among them — take their body size from
    // `chat.fontSize` and their code-block size from `chat.editor.fontSize`, each with a
    // hardcoded fallback of their own. Both must be written, or the chat text stays put
    // while only its code blocks grow.
    for (let i = 0; i < 3; i += 1) {
      await vscode.commands.executeCommand('vsday.increaseFontSize');
    }

    const chatBody = read<number>('chat.fontSize');
    const chatCode = read<number>('chat.editor.fontSize');
    assert.ok(typeof chatBody === 'number' && chatBody > 13, `chat.fontSize was ${chatBody}`);
    assert.ok(
      typeof chatCode === 'number' && chatCode > 12,
      `chat.editor.fontSize was ${chatCode}`
    );
  });

  it('hands every surface back to its own default on reset, pinning nothing (FR-19)', async () => {
    const pinnable = [...SURFACES, 'chat.fontSize', 'chat.editor.fontSize'];

    for (let i = 0; i < 2; i += 1) {
      await vscode.commands.executeCommand('vsday.increaseFontSize');
    }
    await vscode.commands.executeCommand('vsday.resetFontSize');

    // Nothing was set by the user before this test, so a reset must leave settings.json
    // exactly as clean as it found it — every surface, extension webviews included, back
    // on its own default rather than a value VSDay pinned.
    for (const key of [...pinnable, 'window.zoomLevel']) {
      assert.equal(readUserValue(key), undefined, `${key} should not be pinned after reset`);
    }
  });

  it('re-captures the baseline on demand (FR-6)', async () => {
    await vscode.commands.executeCommand('vsday.increaseFontSize');
    const enlarged = read<number>('editor.fontSize')!;

    await vscode.commands.executeCommand('vsday.captureBaseline');

    assert.equal(read<number>('vsday.fontScale.step'), 0);
    await vscode.commands.executeCommand('vsday.increaseFontSize');
    await vscode.commands.executeCommand('vsday.resetFontSize');
    assert.equal(read<number>('editor.fontSize'), enlarged);
  });

  it('survives a settings.json edited by hand mid-session (FR-3)', async () => {
    await vscode.commands.executeCommand('vsday.increaseFontSize');
    // Someone types a size straight into settings.json. Because sizes are recomputed from
    // the baseline rather than from the current value, the next keypress is still correct.
    await write('editor.fontSize', 40);

    await vscode.commands.executeCommand('vsday.increaseFontSize');

    assert.equal(read<number>('editor.fontSize'), 17);
  });

  it('drives the status bar, including the reset dot (FR-13)', async () => {
    api.statusBar.refresh(api.fontScale.state(), api.appearance.activeMode());
    assert.equal(api.statusBar.snapshot().resetDotVisible, false, 'hidden at 100%');

    await vscode.commands.executeCommand('vsday.increaseFontSize');
    const scaled = api.statusBar.snapshot();
    assert.ok(scaled.scaleText.includes('110%'), `scale text was "${scaled.scaleText}"`);
    assert.equal(scaled.resetDotVisible, true, 'shown once away from 100%');

    await vscode.commands.executeCommand('vsday.resetFontSize');
    const reset = api.statusBar.snapshot();
    assert.ok(reset.scaleText.includes('100%'));
    assert.equal(reset.resetDotVisible, false, 'hidden again after reset');
  });

  it('offers − and + buttons wired to the scale commands (FR-20)', async () => {
    api.statusBar.refresh(api.fontScale.state(), api.appearance.activeMode());
    const bar = api.statusBar.snapshot();

    assert.equal(bar.decreaseVisible, true);
    assert.equal(bar.increaseVisible, true);
    assert.equal(bar.commands['vsday.decrease'], 'vsday.decreaseFontSize');
    assert.equal(bar.commands['vsday.increase'], 'vsday.increaseFontSize');
    assert.equal(bar.commands['vsday.reset'], 'vsday.resetFontSize');
    assert.equal(bar.commands['vsday.main'], 'vsday.showMenu');

    // And clicking them does what the label says.
    await vscode.commands.executeCommand(bar.commands['vsday.increase'] as string);
    assert.ok(api.statusBar.snapshot().scaleText.includes('110%'));
    await vscode.commands.executeCommand(bar.commands['vsday.decrease'] as string);
    assert.ok(api.statusBar.snapshot().scaleText.includes('100%'));
  });

  it('honours vsday.statusBar.showStepButtons (FR-20)', async () => {
    await write('vsday.statusBar.showStepButtons', false);
    api.statusBar.refresh(api.fontScale.state(), api.appearance.activeMode());

    const bar = api.statusBar.snapshot();
    assert.equal(bar.decreaseVisible, false);
    assert.equal(bar.increaseVisible, false);
    assert.equal(bar.scaleVisible, true, 'the percentage stays');
  });

  it('honours vsday.statusBar.showResetDot (FR-13)', async () => {
    await write('vsday.statusBar.showResetDot', 'always');
    api.statusBar.refresh(api.fontScale.state(), api.appearance.activeMode());
    assert.equal(api.statusBar.snapshot().resetDotVisible, true);

    await write('vsday.statusBar.showResetDot', 'never');
    await vscode.commands.executeCommand('vsday.increaseFontSize');
    assert.equal(api.statusBar.snapshot().resetDotVisible, false);
  });
});
