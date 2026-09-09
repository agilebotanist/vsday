import * as assert from 'node:assert/strict';
import {
  clampStep,
  computeFontWrites,
  resolveBaseline,
  scalePercentLabel,
  scaledSize,
  zoomLevelForStep,
} from '../../fontScale';
import { BUILT_IN_FONT_TARGETS, STEP_MAX, STEP_MIN } from '../../fontTargets';

describe('scaledSize', () => {
  it('returns the baseline unchanged at step 0 (FR-3)', () => {
    for (const baseline of [4, 10, 12, 14, 18, 32, 72]) {
      assert.equal(scaledSize(baseline, 1.1, 0, 4, 100), baseline);
    }
  });

  it('grows strictly with each positive step until the maximum (FR-1)', () => {
    let previous = scaledSize(14, 1.1, 0, 4, 100);
    for (let step = 1; step <= 12; step += 1) {
      const value = scaledSize(14, 1.1, step, 4, 100);
      assert.ok(value > previous, `step ${step}: ${value} should exceed ${previous}`);
      previous = value;
    }
  });

  it('shrinks strictly with each negative step until the minimum (FR-2)', () => {
    let previous = scaledSize(14, 1.1, 0, 4, 100);
    for (let step = -1; step >= -8; step -= 1) {
      const value = scaledSize(14, 1.1, step, 4, 100);
      assert.ok(value < previous, `step ${step}: ${value} should be below ${previous}`);
      previous = value;
    }
  });

  it('still changes by at least 1px per step for small baselines', () => {
    // round(5 * 1.05) is 5 — the same size the user already had, which reads as a dead
    // keybinding. The step walk forces movement instead.
    assert.equal(scaledSize(5, 1.05, 1, 4, 100), 6);
    assert.equal(scaledSize(5, 1.05, 2, 4, 100), 7);
  });

  it('clamps to the target bounds and stays there', () => {
    assert.equal(scaledSize(14, 1.1, 20, 4, 18), 18);
    assert.equal(scaledSize(14, 1.1, -20, 10, 100), 10);
  });

  it('is a pure function of its inputs — repeated calls never drift (ADR-0001)', () => {
    const first = scaledSize(14, 1.1, 5, 4, 100);
    for (let i = 0; i < 50; i += 1) {
      assert.equal(scaledSize(14, 1.1, 5, 4, 100), first);
    }
  });

  it('round-trips: N increases followed by N decreases lands on the baseline (FR-3)', () => {
    // The invariant that matters to a user hammering +/-: simulate the keypresses the way
    // the controller does — move the step, recompute from the baseline every time.
    for (const baseline of [10, 12, 14, 16, 20]) {
      for (const presses of [1, 3, 7, 12]) {
        let step = 0;
        for (let i = 0; i < presses; i += 1) {
          step = clampStep(step + 1);
          scaledSize(baseline, 1.1, step, 4, 100);
        }
        for (let i = 0; i < presses; i += 1) {
          step = clampStep(step - 1);
        }
        assert.equal(step, 0);
        assert.equal(scaledSize(baseline, 1.1, step, 4, 100), baseline);
      }
    }
  });
});

describe('clampStep', () => {
  it('keeps steps inside the supported range', () => {
    assert.equal(clampStep(999), STEP_MAX);
    assert.equal(clampStep(-999), STEP_MIN);
    assert.equal(clampStep(3.4), 3);
    assert.equal(clampStep(0), 0);
  });
});

describe('computeFontWrites', () => {
  const baselines = {
    'editor.fontSize': 14,
    'terminal.integrated.fontSize': 12,
    'notebook.output.fontSize': 0,
    'editor.codeLens.fontSize': 0,
  };

  it('writes every target that has a baseline (FR-1)', () => {
    const writes = computeFontWrites({
      targets: BUILT_IN_FONT_TARGETS,
      baselines,
      ratio: 1.1,
      step: 2,
    });
    const keys = writes.map((write) => write.setting);
    assert.ok(keys.includes('editor.fontSize'));
    assert.ok(keys.includes('terminal.integrated.fontSize'));
  });

  it('skips targets with no captured baseline', () => {
    const writes = computeFontWrites({
      targets: BUILT_IN_FONT_TARGETS,
      baselines: { 'editor.fontSize': 14 },
      ratio: 1.1,
      step: 1,
    });
    assert.deepEqual(
      writes.map((write) => write.setting),
      ['editor.fontSize']
    );
  });

  it('leaves inheriting targets inheriting when their baseline is 0 (FR-8)', () => {
    const writes = computeFontWrites({
      targets: BUILT_IN_FONT_TARGETS,
      baselines,
      ratio: 1.1,
      step: 4,
    });
    const keys = writes.map((write) => write.setting);
    assert.ok(!keys.includes('notebook.output.fontSize'));
    assert.ok(!keys.includes('editor.codeLens.fontSize'));
  });

  it('ignores non-numeric baselines rather than writing NaN', () => {
    const writes = computeFontWrites({
      targets: BUILT_IN_FONT_TARGETS,
      baselines: { 'editor.fontSize': Number.NaN, 'terminal.integrated.fontSize': 12 },
      ratio: 1.1,
      step: 1,
    });
    assert.deepEqual(
      writes.map((write) => write.setting),
      ['terminal.integrated.fontSize']
    );
  });

  it('scales each target from its own baseline, keeping their proportions', () => {
    const writes = computeFontWrites({
      targets: BUILT_IN_FONT_TARGETS,
      baselines: { 'editor.fontSize': 14, 'terminal.integrated.fontSize': 12 },
      ratio: 1.1,
      step: 3,
    });
    const editor = writes.find((write) => write.setting === 'editor.fontSize');
    const terminal = writes.find((write) => write.setting === 'terminal.integrated.fontSize');
    assert.ok(editor && terminal);
    assert.ok((editor.value as number) > (terminal.value as number));
  });
});

describe('resolveBaseline', () => {
  it('takes a real size as the baseline', () => {
    assert.equal(resolveBaseline(14, {}), 14);
    assert.equal(resolveBaseline(14, { inheritsWhenZero: true }), 14);
  });

  it('leaves an inheriting target with no baseline, so it keeps inheriting (FR-8)', () => {
    assert.equal(resolveBaseline(0, { inheritsWhenZero: true }), undefined);
    assert.equal(resolveBaseline(undefined, { inheritsWhenZero: true }), undefined);
  });

  it('uses the declared fallback when a surface has nothing to inherit from (FR-18)', () => {
    // chat.fontSize is unset by default and its consumers substitute their own 13px, so
    // without a fallback baseline the chat would never scale.
    assert.equal(resolveBaseline(undefined, { baselineFallback: 13 }), 13);
    assert.equal(resolveBaseline(0, { baselineFallback: 13 }), 13);
  });

  it('skips a target that is unset with no fallback and no inheritance', () => {
    assert.equal(resolveBaseline(undefined, {}), undefined);
    assert.equal(resolveBaseline('nonsense', {}), undefined);
    assert.equal(resolveBaseline(Number.NaN, {}), undefined);
  });
});

describe('zoomLevelForStep', () => {
  it('returns undefined when the UI nudge is disabled (FR-5)', () => {
    assert.equal(zoomLevelForStep(0, 5, 0.1, false), undefined);
  });

  it('offsets from the captured baseline so a reset restores the user’s own zoom', () => {
    assert.equal(zoomLevelForStep(1, 0, 0.1, true), 1);
    assert.equal(zoomLevelForStep(1, 4, 0.1, true), 1.4);
  });

  it('clamps to the supported zoom range', () => {
    assert.equal(zoomLevelForStep(0, 20, 1, true), 5);
    assert.equal(zoomLevelForStep(0, -20, 1, true), -5);
  });

  it('rounds to two decimals to keep settings.json tidy', () => {
    assert.equal(zoomLevelForStep(0, 3, 0.1, true), 0.3);
    assert.equal(zoomLevelForStep(0, 7, 0.15, true), 1.05);
  });
});

describe('scalePercentLabel', () => {
  it('reads 100% at the baseline', () => {
    assert.equal(scalePercentLabel(1.1, 0), '100%');
  });

  it('reports the compounded percentage', () => {
    assert.equal(scalePercentLabel(1.1, 2), '121%');
    assert.equal(scalePercentLabel(1.1, -1), '91%');
  });
});
