import * as assert from 'node:assert/strict';
import { CONFIG } from '../../config';
import { FontScaleController } from '../../fontScaleController';
import { BUILT_IN_FONT_TARGETS, WINDOW_ZOOM_LEVEL } from '../../fontTargets';
import { createMemoryLogger } from '../../logging';
import { FakeSettingsService } from '../support/fakeSettings';

/**
 * A fake configuration shaped like a stock VS Code install.
 *
 * The strategy is pinned to `textFirst` because most of these tests are about the font
 * arithmetic, which is what that strategy exercises. The strategy suite below overrides it;
 * the shipped default (`uniform`) is asserted there against a bare fake.
 */
function makeSettings(overrides: Record<string, unknown> = {}): FakeSettingsService {
  const settings = new FakeSettingsService({
    [CONFIG.scaleStrategy]: 'textFirst',
    [CONFIG.step]: 0,
    [CONFIG.ratio]: 1.1,
    [CONFIG.baselines]: {},
    [CONFIG.extraTargets]: [],
    [CONFIG.uiZoomEnabled]: true,
    [CONFIG.uiZoomPerStep]: 0.1,
    [WINDOW_ZOOM_LEVEL]: 0,
    'editor.fontSize': 14,
    'terminal.integrated.fontSize': 12,
    'debug.console.fontSize': 14,
    'markdown.preview.fontSize': 14,
    'scm.inputFontSize': 13,
    // Registered but with no default value — how VS Code actually ships chat.fontSize.
    'chat.fontSize': undefined,
    'chat.editor.fontSize': 12,
    'notebook.output.fontSize': 0,
    'notebook.markup.fontSize': 0,
    'editor.suggestFontSize': 0,
    'editor.codeLens.fontSize': 0,
    'editor.inlayHints.fontSize': 0,
  });

  for (const [key, value] of Object.entries(overrides)) {
    settings.seedUserValue(key, value);
  }
  return settings;
}

function makeController(settings: FakeSettingsService) {
  const logger = createMemoryLogger();
  return { controller: new FontScaleController(settings, logger), logger };
}

describe('FontScaleController.targets', () => {
  it('skips settings this VS Code build does not have (FR-7)', () => {
    // An older VS Code, or one without the extension owning a setting: writing an
    // unregistered key throws, so the target has to be filtered out first.
    const settings = new FakeSettingsService({
      [CONFIG.extraTargets]: [],
      'editor.fontSize': 14,
    });
    const { controller, logger } = makeController(settings);

    assert.deepEqual(
      controller.targets().map((target) => target.setting),
      ['editor.fontSize']
    );
    assert.ok(logger.messages.some((message) => message.includes('terminal.integrated.fontSize')));
  });

  it('includes user-declared extra targets when they exist', () => {
    const settings = makeSettings();
    settings.register('someExt.fontSize', 11);
    settings.seedUserValue(CONFIG.extraTargets, ['someExt.fontSize']);
    const { controller } = makeController(settings);

    assert.ok(controller.targets().some((target) => target.setting === 'someExt.fontSize'));
  });
});

describe('FontScaleController.ensureBaselines', () => {
  it('captures the user’s current sizes as the 100% baseline (FR-3)', async () => {
    const settings = makeSettings();
    const { controller } = makeController(settings);

    const baselines = await controller.ensureBaselines(controller.targets());

    assert.equal(baselines['editor.fontSize'], 14);
    assert.equal(baselines['terminal.integrated.fontSize'], 12);
    assert.equal(baselines[WINDOW_ZOOM_LEVEL], 0);
  });

  it('never re-captures a baseline it already has — that would enshrine a scaled size', async () => {
    const settings = makeSettings({ [CONFIG.baselines]: { 'editor.fontSize': 14 } });
    settings.seedUserValue('editor.fontSize', 22); // as if we had already scaled up
    const { controller } = makeController(settings);

    const baselines = await controller.ensureBaselines(controller.targets());

    assert.equal(baselines['editor.fontSize'], 14);
  });

  it('does not write when there is nothing new to capture', async () => {
    const settings = makeSettings();
    const { controller } = makeController(settings);
    await controller.ensureBaselines(controller.targets());
    const writesAfterFirst = settings.writes.length;

    await controller.ensureBaselines(controller.targets());

    assert.equal(settings.writes.length, writesAfterFirst);
  });
});

describe('FontScaleController.applyStep', () => {
  it('scales every surface and records the step (FR-1, FR-4)', async () => {
    const settings = makeSettings();
    const { controller } = makeController(settings);

    await controller.applyStep(3);

    assert.equal(settings.get<number>('editor.fontSize'), 19);
    assert.equal(settings.get<number>('terminal.integrated.fontSize'), 16);
    assert.equal(settings.get<number>('markdown.preview.fontSize'), 19);
    assert.equal(settings.get<number>(CONFIG.step), 3);
  });

  it('nudges window.zoomLevel so workbench chrome keeps up (FR-5)', async () => {
    const settings = makeSettings();
    const { controller } = makeController(settings);

    await controller.applyStep(4);

    assert.equal(settings.get<number>(WINDOW_ZOOM_LEVEL), 0.4);
  });

  it('leaves window.zoomLevel alone when the UI nudge is off (FR-5)', async () => {
    const settings = makeSettings({ [CONFIG.uiZoomEnabled]: false });
    const { controller } = makeController(settings);

    await controller.applyStep(4);

    assert.ok(!settings.writes.some((write) => write.key === WINDOW_ZOOM_LEVEL));
  });

  it('clamps a wild step instead of writing an absurd size', async () => {
    const settings = makeSettings();
    const { controller } = makeController(settings);

    const applied = await controller.applyStep(9999);

    assert.equal(applied, 20);
    assert.ok(settings.get<number>('editor.fontSize')! <= 100);
  });

  it('keeps inheriting surfaces inheriting (FR-8)', async () => {
    const settings = makeSettings();
    const { controller } = makeController(settings);

    await controller.applyStep(5);

    assert.equal(settings.get<number>('notebook.output.fontSize'), 0);
    assert.equal(settings.get<number>('editor.codeLens.fontSize'), 0);
  });

  it('falls back to the default ratio when the configured one is nonsense', async () => {
    const settings = makeSettings({ [CONFIG.ratio]: 0 });
    const { controller } = makeController(settings);

    await controller.applyStep(1);

    assert.equal(settings.get<number>('editor.fontSize'), 15);
  });

  it('is idempotent: applying the same step twice yields the same sizes', async () => {
    const settings = makeSettings();
    const { controller } = makeController(settings);

    await controller.applyStep(6);
    const first = settings.get<number>('editor.fontSize');
    await controller.applyStep(6);

    assert.equal(settings.get<number>('editor.fontSize'), first);
  });
});

describe('FontScaleController scaling strategy', () => {
  it('defaults to scaling everything by window zoom (FR-22)', () => {
    // A configuration that has never heard of the setting must still land on the shipped
    // default, which is the whole point of the change.
    const { controller } = makeController(new FakeSettingsService());
    assert.equal(controller.strategy(), 'uniform');
  });

  it('uniform: zoom carries the scale and font sizes stay put (FR-22)', async () => {
    const settings = makeSettings({ [CONFIG.scaleStrategy]: 'uniform' });
    const { controller } = makeController(settings);

    await controller.applyStep(5);

    // Nothing pinned: the fonts are left on their own defaults…
    assert.equal(settings.getUserValue('editor.fontSize'), undefined);
    assert.equal(settings.getUserValue('chat.fontSize'), undefined);
    // …and the zoom level carries all of it, at ratio-per-step.
    const zoom = settings.get<number>(WINDOW_ZOOM_LEVEL)!;
    assert.ok(Math.abs(1.2 ** zoom - 1.1 ** 5) < 0.01, `zoom ${zoom} should render 1.1**5`);
  });

  it('uniform: honours a size the user chose, since removing it would change it', async () => {
    const settings = makeSettings({ [CONFIG.scaleStrategy]: 'uniform', 'editor.fontSize': 17 });
    const { controller } = makeController(settings);

    await controller.applyStep(4);

    assert.equal(settings.get<number>('editor.fontSize'), 17);
  });

  it('textFirst: fonts carry the scale with only a nudge to zoom (FR-5)', async () => {
    const settings = makeSettings();
    const { controller } = makeController(settings);

    await controller.applyStep(5);

    assert.equal(settings.get<number>('editor.fontSize'), 23);
    assert.equal(settings.get<number>(WINDOW_ZOOM_LEVEL), 0.5);
  });

  it('switching strategy re-applies the step, leaving nothing from the old one (FR-22)', async () => {
    const settings = makeSettings();
    const { controller } = makeController(settings);
    await controller.applyStep(5);
    assert.equal(settings.get<number>('editor.fontSize'), 23);

    assert.equal(await controller.toggleStrategy(), 'uniform');

    // The font sizes textFirst had written are gone, and zoom now carries the scale.
    assert.equal(settings.getUserValue('editor.fontSize'), undefined);
    assert.ok(settings.get<number>(WINDOW_ZOOM_LEVEL)! > 2);
    assert.equal(controller.currentStep(), 5, 'the step itself is unchanged');

    assert.equal(await controller.toggleStrategy(), 'textFirst');
    assert.equal(settings.get<number>('editor.fontSize'), 23);
    assert.equal(settings.get<number>(WINDOW_ZOOM_LEVEL), 0.5);
  });

  it('uniform: ignores uiZoom.enabled, since zoom is the only thing scaling', async () => {
    const settings = makeSettings({
      [CONFIG.scaleStrategy]: 'uniform',
      [CONFIG.uiZoomEnabled]: false,
    });
    const { controller } = makeController(settings);

    await controller.applyStep(3);

    assert.ok(settings.get<number>(WINDOW_ZOOM_LEVEL)! > 0);
  });

  it('reset returns the zoom level to the user’s own under either strategy', async () => {
    for (const strategy of ['uniform', 'textFirst']) {
      const settings = makeSettings({ [CONFIG.scaleStrategy]: strategy, [WINDOW_ZOOM_LEVEL]: 1 });
      const { controller } = makeController(settings);

      await controller.applyStep(4);
      await controller.reset();

      assert.equal(settings.get<number>(WINDOW_ZOOM_LEVEL), 1, strategy);
    }
  });
});

describe('FontScaleController.reconcile', () => {
  it('writes nothing when there is nothing to fix', async () => {
    const settings = makeSettings();
    const { controller } = makeController(settings);

    assert.equal(await controller.reconcile(), false);
    assert.equal(settings.writes.length, 0);
  });

  it('repairs a state left half-applied by an upgrade or a hand edit', async () => {
    // As if a previous version had scaled the editor but never known about chat.fontSize,
    // and the strategy has since become uniform: the editor size must come back down.
    const settings = makeSettings({
      [CONFIG.scaleStrategy]: 'uniform',
      [CONFIG.step]: 5,
      [CONFIG.baselines]: { 'editor.fontSize': 14, 'window.zoomLevel': 0 },
      'editor.fontSize': 23,
    });
    const { controller } = makeController(settings);

    assert.equal(await controller.reconcile(), true);

    assert.equal(settings.getUserValue('editor.fontSize'), undefined);
    assert.ok(settings.get<number>(WINDOW_ZOOM_LEVEL)! > 2);
  });

  it('is idempotent — a second pass finds nothing to do', async () => {
    const settings = makeSettings({
      [CONFIG.scaleStrategy]: 'uniform',
      [CONFIG.step]: 3,
      [CONFIG.baselines]: { 'editor.fontSize': 14, 'window.zoomLevel': 0 },
      'editor.fontSize': 19,
    });
    const { controller } = makeController(settings);

    assert.equal(await controller.reconcile(), true);
    assert.equal(await controller.reconcile(), false);
  });
});

describe('FontScaleController and chat surfaces', () => {
  it('scales chat body text even though the setting is unset (FR-18)', async () => {
    const settings = makeSettings();
    const { controller } = makeController(settings);

    await controller.applyStep(3);

    // From the 13px fallback: 13 → 14 → 16 → 17.
    assert.equal(settings.get<number>('chat.fontSize'), 17);
    assert.equal(settings.get<number>('chat.editor.fontSize'), 16);
  });

  it('hands chat surfaces back to their defaults on reset (FR-19)', async () => {
    const settings = makeSettings();
    const { controller } = makeController(settings);

    await controller.applyStep(3);
    assert.notEqual(settings.getUserValue('chat.fontSize'), undefined);

    await controller.reset();

    // The setting had no default at all, so "back to default" means removing our value —
    // leaving the chat to apply its own 13px again.
    assert.equal(settings.getUserValue('chat.fontSize'), undefined);
    assert.equal(settings.getUserValue('chat.editor.fontSize'), undefined);
  });
});

describe('FontScaleController reset', () => {
  it('restores every size bit-exactly, whatever route was taken there (FR-3)', async () => {
    const settings = makeSettings();
    const { controller } = makeController(settings);
    const before = Object.fromEntries(
      BUILT_IN_FONT_TARGETS.map((target) => [target.setting, settings.get<number>(target.setting)])
    );

    for (let i = 0; i < 5; i += 1) {
      await controller.increase();
    }
    await controller.decrease();
    await controller.increase();
    await controller.reset();

    for (const target of BUILT_IN_FONT_TARGETS) {
      assert.equal(
        settings.get<number>(target.setting),
        before[target.setting],
        `${target.setting} should be back to its original size`
      );
    }
    assert.equal(controller.currentStep(), 0);
  });

  it('removes every value that equals the setting default, rather than pinning it (FR-19)', async () => {
    const settings = makeSettings();
    const { controller } = makeController(settings);

    await controller.increase();
    await controller.reset();

    // Effective sizes are unchanged, but settings.json is left as clean as we found it —
    // which is what makes every surface, VSDay's own and any extension's, return to its
    // own default rather than to a value we pinned.
    for (const key of ['editor.fontSize', 'terminal.integrated.fontSize', 'scm.inputFontSize']) {
      assert.equal(settings.getUserValue(key), undefined, `${key} should have been removed`);
      assert.equal(settings.get<number>(key), settings.getDefaultValue<number>(key));
    }
  });

  it('keeps a size the user had chosen themselves, since removing it would change it', async () => {
    const settings = makeSettings({ 'editor.fontSize': 17 });
    const { controller } = makeController(settings);

    await controller.increase();
    await controller.reset();

    assert.equal(settings.getUserValue<number>('editor.fontSize'), 17);
  });

  it('removes our window.zoomLevel value rather than pinning a redundant 0', async () => {
    const settings = makeSettings();
    const { controller } = makeController(settings);

    await controller.increase();
    await controller.reset();

    assert.equal(settings.getUserValue(WINDOW_ZOOM_LEVEL), undefined);
  });

  it('restores a zoom level the user had set before VSDay touched it', async () => {
    const settings = makeSettings({ [WINDOW_ZOOM_LEVEL]: 1 });
    const { controller } = makeController(settings);

    await controller.applyStep(3);
    assert.equal(settings.get<number>(WINDOW_ZOOM_LEVEL), 1.3);

    await controller.reset();
    assert.equal(settings.get<number>(WINDOW_ZOOM_LEVEL), 1);
  });
});

describe('FontScaleController.captureBaseline', () => {
  it('adopts the current sizes as the new 100% and returns to step 0 (FR-6)', async () => {
    const settings = makeSettings();
    const { controller } = makeController(settings);
    await controller.applyStep(4);
    const scaled = settings.get<number>('editor.fontSize');

    await controller.captureBaseline();

    assert.equal(controller.currentStep(), 0);
    const baselines = settings.get<Record<string, number>>(CONFIG.baselines)!;
    assert.equal(baselines['editor.fontSize'], scaled);

    // And the new baseline is what a reset now returns to.
    await controller.increase();
    await controller.reset();
    assert.equal(settings.get<number>('editor.fontSize'), scaled);
  });
});

describe('FontScaleController.state', () => {
  it('reports the percentage and the effective editor size for the status bar (FR-13)', async () => {
    const settings = makeSettings();
    const { controller } = makeController(settings);

    assert.deepEqual(controller.state(), {
      step: 0,
      percentLabel: '100%',
      editorFontSize: 14,
      strategy: 'textFirst',
    });

    await controller.applyStep(2);

    assert.deepEqual(controller.state(), {
      step: 2,
      percentLabel: '121%',
      editorFontSize: 17,
      strategy: 'textFirst',
    });
  });

  it('works before any baseline has been captured', () => {
    const settings = makeSettings();
    const { controller } = makeController(settings);

    assert.equal(controller.state().editorFontSize, 14);
  });

  it('reports the configured size, not the zoomed one, under uniform scaling (FR-22)', async () => {
    const settings = makeSettings({ [CONFIG.scaleStrategy]: 'uniform' });
    const { controller } = makeController(settings);

    await controller.applyStep(4);
    const state = controller.state();

    assert.equal(state.percentLabel, '146%', 'the scale is real, and reported');
    assert.equal(state.editorFontSize, 14, 'but the font setting itself has not moved');
    assert.equal(state.strategy, 'uniform');
  });
});
