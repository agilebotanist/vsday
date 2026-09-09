import * as assert from 'node:assert/strict';
import { BUILT_IN_FONT_TARGETS, EDITOR_FONT_SIZE, resolveFontTargets } from '../../fontTargets';

describe('BUILT_IN_FONT_TARGETS', () => {
  it('has no duplicate settings', () => {
    const settings = BUILT_IN_FONT_TARGETS.map((target) => target.setting);
    assert.equal(new Set(settings).size, settings.length);
  });

  it('covers the editor plus the other readable surfaces (FR-1)', () => {
    const settings = BUILT_IN_FONT_TARGETS.map((target) => target.setting);
    for (const expected of [
      EDITOR_FONT_SIZE,
      'terminal.integrated.fontSize',
      'debug.console.fontSize',
      'markdown.preview.fontSize',
      'scm.inputFontSize',
      'chat.fontSize',
      'chat.editor.fontSize',
      'notebook.output.fontSize',
      'notebook.markup.fontSize',
    ]) {
      assert.ok(settings.includes(expected), `${expected} should be a target`);
    }
  });

  it('scales chat body text, not just chat code blocks (FR-18)', () => {
    // `chat.editor.fontSize` covers only code blocks inside a chat; the chat's own text
    // comes from `chat.fontSize`. Scaling one without the other is the bug this pins.
    const chatBody = BUILT_IN_FONT_TARGETS.find((target) => target.setting === 'chat.fontSize');
    assert.ok(chatBody, 'chat.fontSize must be a target');
    assert.equal(chatBody.baselineFallback, 13, 'must match the 13px chat consumers assume');
    assert.ok(!chatBody.inheritsWhenZero, 'chat.fontSize inherits from nothing');
  });

  it('never declares both an inheritance rule and a fallback baseline', () => {
    for (const target of BUILT_IN_FONT_TARGETS) {
      assert.ok(
        !(target.inheritsWhenZero && target.baselineFallback !== undefined),
        `${target.setting} declares contradictory baseline rules`
      );
    }
  });

  it('declares sane bounds for every target', () => {
    for (const target of BUILT_IN_FONT_TARGETS) {
      assert.ok(target.min < target.max, `${target.setting} bounds`);
      assert.ok(target.min >= 0, `${target.setting} min`);
      assert.ok(target.label.length > 0, `${target.setting} label`);
    }
  });

  it('marks exactly the settings whose 0 means "inherit"', () => {
    const inheriting = BUILT_IN_FONT_TARGETS.filter((target) => target.inheritsWhenZero).map(
      (target) => target.setting
    );
    assert.deepEqual(inheriting.sort(), [
      'editor.codeLens.fontSize',
      'editor.inlayHints.fontSize',
      'editor.suggestFontSize',
      'notebook.markup.fontSize',
      'notebook.output.fontSize',
    ]);
  });
});

describe('resolveFontTargets', () => {
  it('returns the built-ins when there are no extras', () => {
    assert.equal(resolveFontTargets().length, BUILT_IN_FONT_TARGETS.length);
  });

  it('appends user-declared extra targets (FR-9)', () => {
    const targets = resolveFontTargets(['someExt.fontSize']);
    assert.equal(targets.length, BUILT_IN_FONT_TARGETS.length + 1);
    assert.ok(targets.some((target) => target.setting === 'someExt.fontSize'));
  });

  it('ignores blank entries and anything already built in', () => {
    const targets = resolveFontTargets([
      '',
      '   ',
      EDITOR_FONT_SIZE,
      'someExt.fontSize',
      'someExt.fontSize',
    ]);
    assert.equal(targets.length, BUILT_IN_FONT_TARGETS.length + 1);
  });

  it('trims whitespace around an extra target', () => {
    const targets = resolveFontTargets(['  someExt.fontSize  ']);
    assert.ok(targets.some((target) => target.setting === 'someExt.fontSize'));
  });
});
