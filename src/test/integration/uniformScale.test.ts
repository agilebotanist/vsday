import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { VSDayApi } from '../../extension';
import { activateExtension, read, readUserValue, resetSettings, write } from './support';

/**
 * The shipped default strategy: `window.zoomLevel` carries the whole scale.
 *
 * This is what reaches the parts of VS Code that have no font-size setting at all — the
 * Explorer, the Extensions view, the Settings UI, tab labels, and every extension webview.
 * There is no API to observe a rendered pixel size, so what is asserted here is the
 * mechanism: zoom moves by the right amount, and the font settings are left alone.
 */
describe('Uniform scaling end to end', () => {
  let api: VSDayApi;

  const FONT_SETTINGS = [
    'editor.fontSize',
    'terminal.integrated.fontSize',
    'markdown.preview.fontSize',
    'chat.fontSize',
    'chat.editor.fontSize',
  ];

  before(async () => {
    api = await activateExtension();
  });

  beforeEach(async () => {
    await resetSettings();
  });

  after(async () => {
    await resetSettings();
  });

  it('is the default strategy (FR-22)', () => {
    assert.equal(read<string>('vsday.scaleStrategy'), 'uniform');
    assert.equal(api.fontScale.strategy(), 'uniform');
  });

  it('scales by zoom alone, leaving every font setting untouched (FR-22)', async () => {
    for (let i = 0; i < 4; i += 1) {
      await vscode.commands.executeCommand('vsday.increaseFontSize');
    }

    for (const key of FONT_SETTINGS) {
      assert.equal(readUserValue(key), undefined, `${key} should not have been written`);
    }

    // Four steps at ratio 1.1 is 1.4641×; as zoom levels (factor 1.2) that is ~2.09.
    const zoom = read<number>('window.zoomLevel')!;
    assert.ok(Math.abs(1.2 ** zoom - 1.1 ** 4) < 0.01, `zoom ${zoom} should render 1.1**4`);
  });

  it('reports the true scale on the status bar (FR-13, FR-22)', async () => {
    await vscode.commands.executeCommand('vsday.increaseFontSize');

    assert.ok(api.statusBar.snapshot().scaleText.includes('110%'));
  });

  it('returns everything to defaults on reset (FR-19, FR-22)', async () => {
    for (let i = 0; i < 3; i += 1) {
      await vscode.commands.executeCommand('vsday.increaseFontSize');
    }
    await vscode.commands.executeCommand('vsday.resetFontSize');

    assert.equal(readUserValue('window.zoomLevel'), undefined);
    for (const key of FONT_SETTINGS) {
      assert.equal(readUserValue(key), undefined, `${key} should not be pinned`);
    }
  });

  it('switching to text-first moves the scale from zoom into the font settings (FR-22)', async () => {
    for (let i = 0; i < 3; i += 1) {
      await vscode.commands.executeCommand('vsday.increaseFontSize');
    }
    const zoomUnderUniform = read<number>('window.zoomLevel')!;

    await vscode.commands.executeCommand('vsday.toggleScaleStrategy');

    assert.equal(read<string>('vsday.scaleStrategy'), 'textFirst');
    assert.equal(read<number>('editor.fontSize'), 19, 'fonts now carry the scale');
    assert.ok(
      read<number>('window.zoomLevel')! < zoomUnderUniform,
      'and zoom drops back to the small nudge'
    );
    assert.equal(read<number>('vsday.fontScale.step'), 3, 'the step is unchanged');

    // …and back again, with nothing left behind from text-first.
    await vscode.commands.executeCommand('vsday.toggleScaleStrategy');
    assert.equal(read<string>('vsday.scaleStrategy'), 'uniform');
    assert.equal(readUserValue('editor.fontSize'), undefined);
  });

  it('reconciles a state left behind by an older version (FR-23)', async () => {
    // Exactly the shape a 0.2.x install leaves: font sizes written by the old
    // font-scaling behaviour, with a step recorded and the new default strategy in force.
    await write('vsday.fontScale.baselines', { 'editor.fontSize': 14, 'window.zoomLevel': 0 });
    await write('vsday.fontScale.step', 5);
    await write('editor.fontSize', 23);

    assert.equal(await api.fontScale.reconcile(), true);

    assert.equal(readUserValue('editor.fontSize'), undefined, 'the stale size is cleared');
    assert.ok(read<number>('window.zoomLevel')! > 2, 'and zoom now carries the scale');
    assert.equal(await api.fontScale.reconcile(), false, 'and it settles');
  });
});
