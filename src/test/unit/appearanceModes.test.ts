import * as assert from 'node:assert/strict';
import {
  MODE_DESCRIPTORS,
  MODE_IDS,
  SEPIA_HC_THEME,
  SEPIA_THEME,
  THEME_FALLBACKS,
  computeOverrideReset,
  computeOverrideTransition,
  isModeId,
  isReservedOverrideKey,
  nextMode,
  normalizeCycleOrder,
  partitionOverrides,
} from '../../appearanceModes';

describe('isModeId', () => {
  it('accepts the four modes and nothing else', () => {
    assert.deepEqual([...MODE_IDS], ['day', 'night', 'eyeSaving', 'highContrast']);
    for (const id of MODE_IDS) {
      assert.ok(isModeId(id));
    }
    for (const value of ['none', 'Day', '', undefined, null, 7, {}]) {
      assert.ok(!isModeId(value));
    }
  });
});

describe('mode descriptors', () => {
  it('describes every mode', () => {
    for (const id of MODE_IDS) {
      const descriptor = MODE_DESCRIPTORS[id];
      assert.equal(descriptor.id, id);
      assert.ok(descriptor.label.length > 0);
      assert.ok(descriptor.description.length > 0);
    }
  });

  it('uses only codicons that exist (an unknown one renders as literal "$(name)")', () => {
    // Verified against the codicon set shipped with VS Code. `sun`, `moon` and `contrast`
    // are NOT codicons, which is exactly the trap this test exists to catch.
    const verifiedCodicons = new Set([
      'lightbulb',
      'circle-large-filled',
      'circle-large-outline',
      'eye',
      'eye-closed',
      'color-mode',
      'symbol-color',
      'paintcan',
      'flame',
      'star-full',
      'book',
      'shield',
    ]);
    for (const id of MODE_IDS) {
      assert.ok(
        verifiedCodicons.has(MODE_DESCRIPTORS[id].icon),
        `${id} uses unverified codicon "${MODE_DESCRIPTORS[id].icon}"`
      );
    }
  });
});

describe('THEME_FALLBACKS', () => {
  it('offers candidates for every mode', () => {
    for (const id of MODE_IDS) {
      assert.ok(THEME_FALLBACKS[id].length > 0, `${id} needs theme candidates`);
    }
  });

  it('spans the theme names VS Code has used across supported versions', () => {
    // 1.85 shipped `Default Dark Modern`, later releases renamed it `Dark Modern`, and
    // 1.136 defaults to `Dark 2026`. All three have to be tried.
    assert.ok(THEME_FALLBACKS.night.includes('Dark 2026'));
    assert.ok(THEME_FALLBACKS.night.includes('Dark Modern'));
    assert.ok(THEME_FALLBACKS.night.includes('Default Dark Modern'));
    assert.ok(THEME_FALLBACKS.day.includes('Light 2026'));
    assert.ok(THEME_FALLBACKS.day.includes('Default Light Modern'));
  });

  it('prefers the bundled warm themes for the reading modes', () => {
    assert.equal(THEME_FALLBACKS.eyeSaving[0], SEPIA_THEME);
    assert.equal(THEME_FALLBACKS.highContrast[0], SEPIA_HC_THEME);
    // …and still degrades to VS Code's own if ours were ever unavailable.
    assert.ok(THEME_FALLBACKS.highContrast.includes('Default High Contrast Light'));
  });
});

describe('normalizeCycleOrder', () => {
  it('drops unknown entries and duplicates', () => {
    assert.deepEqual(normalizeCycleOrder(['night', 'bogus', 'night', 'day']), ['night', 'day']);
  });

  it('falls back to the full cycle when nothing usable is configured', () => {
    assert.deepEqual(normalizeCycleOrder([]), [...MODE_IDS]);
    assert.deepEqual(normalizeCycleOrder(undefined), [...MODE_IDS]);
    assert.deepEqual(normalizeCycleOrder(['nope']), [...MODE_IDS]);
  });
});

describe('nextMode', () => {
  it('walks the configured order and wraps around (FR-10)', () => {
    const order = ['day', 'night', 'eyeSaving', 'highContrast'];
    assert.equal(nextMode(order, 'day'), 'night');
    assert.equal(nextMode(order, 'night'), 'eyeSaving');
    assert.equal(nextMode(order, 'eyeSaving'), 'highContrast');
    assert.equal(nextMode(order, 'highContrast'), 'day');
  });

  it('skips modes the user removed from the cycle', () => {
    assert.equal(nextMode(['day', 'highContrast'], 'day'), 'highContrast');
    assert.equal(nextMode(['day', 'highContrast'], 'highContrast'), 'day');
  });

  it('starts the cycle when no mode is active', () => {
    assert.equal(nextMode(['night', 'day'], 'none'), 'night');
  });

  it('starts the cycle when the active mode is not part of the order', () => {
    assert.equal(nextMode(['night', 'day'], 'eyeSaving'), 'night');
  });

  it('is stable for a single-entry cycle', () => {
    assert.equal(nextMode(['day'], 'day'), 'day');
  });
});

describe('isReservedOverrideKey', () => {
  const fontSettings = ['editor.fontSize', 'terminal.integrated.fontSize'];

  it('protects the settings VSDay manages itself (FR-12)', () => {
    assert.ok(isReservedOverrideKey('workbench.colorTheme', fontSettings));
    assert.ok(isReservedOverrideKey('window.zoomLevel', fontSettings));
    assert.ok(isReservedOverrideKey('editor.fontSize', fontSettings));
    assert.ok(isReservedOverrideKey('vsday.fontScale.step', fontSettings));
  });

  it('allows ordinary comfort settings', () => {
    assert.ok(!isReservedOverrideKey('editor.lineHeight', fontSettings));
    assert.ok(!isReservedOverrideKey('editor.cursorBlinking', fontSettings));
  });
});

describe('partitionOverrides', () => {
  it('separates what we will apply from what we refuse', () => {
    const { accepted, rejected } = partitionOverrides(
      { 'editor.lineHeight': 1.6, 'editor.fontSize': 20, 'workbench.colorTheme': 'X' },
      ['editor.fontSize']
    );
    assert.deepEqual(accepted, { 'editor.lineHeight': 1.6 });
    assert.deepEqual(rejected.sort(), ['editor.fontSize', 'workbench.colorTheme']);
  });

  it('treats a missing map as empty', () => {
    assert.deepEqual(partitionOverrides(undefined, []), { accepted: {}, rejected: [] });
  });
});

describe('computeOverrideTransition', () => {
  it('captures the user’s current value as the original on first apply (FR-11)', () => {
    const transition = computeOverrideTransition({}, { 'editor.lineHeight': 1.6 }, (key) =>
      key === 'editor.lineHeight' ? 1.2 : undefined
    );

    assert.deepEqual(transition.applies, [{ key: 'editor.lineHeight', value: 1.6 }]);
    assert.deepEqual(transition.restores, []);
    assert.deepEqual(transition.nextOriginals, { 'editor.lineHeight': 1.2 });
  });

  it('records "the user had nothing set" as null so we can remove our value later', () => {
    const transition = computeOverrideTransition({}, { 'editor.lineHeight': 1.6 }, () => undefined);
    assert.deepEqual(transition.nextOriginals, { 'editor.lineHeight': null });
  });

  it('restores keys the outgoing mode owned that the incoming one does not (FR-11)', () => {
    const transition = computeOverrideTransition(
      { 'editor.lineHeight': 1.2, 'editor.cursorBlinking': null },
      { 'editor.renderWhitespace': 'none' },
      () => undefined
    );

    assert.deepEqual(transition.restores, [
      { key: 'editor.lineHeight', value: 1.2 },
      { key: 'editor.cursorBlinking', value: undefined },
    ]);
    assert.deepEqual(transition.applies, [{ key: 'editor.renderWhitespace', value: 'none' }]);
    assert.deepEqual(transition.nextOriginals, { 'editor.renderWhitespace': null });
  });

  it('never re-reads a key it already tracks, so our own override is not mistaken for the user’s', () => {
    // The tracked original is 1.2; the *current* value is 1.6 because we wrote it. A mode
    // switch that re-read it would enshrine 1.6 as the user's preference forever.
    const reads: string[] = [];
    const transition = computeOverrideTransition(
      { 'editor.lineHeight': 1.2 },
      { 'editor.lineHeight': 2.0 },
      (key) => {
        reads.push(key);
        return 1.6;
      }
    );

    assert.deepEqual(reads, []);
    assert.deepEqual(transition.nextOriginals, { 'editor.lineHeight': 1.2 });
    assert.deepEqual(transition.applies, [{ key: 'editor.lineHeight', value: 2.0 }]);
  });

  it('is idempotent when the same mode is applied twice', () => {
    const first = computeOverrideTransition({}, { 'editor.lineHeight': 1.6 }, () => 1.2);
    const second = computeOverrideTransition(
      first.nextOriginals,
      { 'editor.lineHeight': 1.6 },
      () => 1.6
    );
    assert.deepEqual(second.nextOriginals, first.nextOriginals);
    assert.deepEqual(second.restores, []);
  });

  it('tolerates a missing tracking record (first ever run)', () => {
    const transition = computeOverrideTransition(undefined, {}, () => undefined);
    assert.deepEqual(transition, { restores: [], applies: [], nextOriginals: {} });
  });
});

describe('computeOverrideReset', () => {
  it('gives back every tracked original and tracks nothing afterwards', () => {
    const transition = computeOverrideReset({
      'editor.lineHeight': 1.2,
      'editor.cursorBlinking': null,
    });

    assert.deepEqual(transition.restores, [
      { key: 'editor.lineHeight', value: 1.2 },
      { key: 'editor.cursorBlinking', value: undefined },
    ]);
    assert.deepEqual(transition.applies, []);
    assert.deepEqual(transition.nextOriginals, {});
  });
});
