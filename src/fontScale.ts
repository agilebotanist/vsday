/**
 * The font scale arithmetic — pure functions, no `vscode` import.
 *
 * Design rule (ADR-0001): a scaled size is always recomputed from the captured
 * *baseline*, never from the currently-effective value. Incremental read-modify-write
 * accumulates rounding error, breaks when settings.json is edited by hand mid-session,
 * and makes "reset" only approximately correct. Recomputing from the baseline makes
 * reset bit-exact and makes N increases followed by N decreases a no-op.
 */
import { FontTarget, STEP_MAX, STEP_MIN, ZOOM_LEVEL_MAX, ZOOM_LEVEL_MIN } from './fontTargets';

/**
 * How a scale step is delivered.
 *
 * - `textFirst` — font settings carry the scale, with a small `window.zoomLevel` nudge so
 *   workbench chrome does not fall behind. Precise control per surface, but panes with no
 *   font-size setting (the Extensions view, Explorer, Settings UI, most extension
 *   webviews) only get the nudge, and a font-scaled webview can outgrow a layout built for
 *   13px text.
 * - `uniform` — `window.zoomLevel` carries the whole scale and font settings stay at their
 *   baseline. Every pane scales identically, containers included, so nothing is left behind
 *   and no layout breaks; the cost is that padding and icons grow too, so less fits on
 *   screen.
 */
export type ScaleStrategy = 'textFirst' | 'uniform';

/** One VS Code zoom level is a factor of 1.2. */
export const ZOOM_LEVEL_FACTOR = 1.2;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Zoom levels per step that make zoom grow text at exactly `ratio` per step.
 *
 * Solves `1.2 ** x === ratio`, so a `uniform` step feels the same size as a `textFirst`
 * step and the percentage on the status bar stays truthful under either strategy.
 */
export function zoomPerStepForRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 1) {
    return 0;
  }
  return Math.log(ratio) / Math.log(ZOOM_LEVEL_FACTOR);
}

/** Keeps a step inside the supported range. */
export function clampStep(step: number): number {
  return clamp(Math.round(step), STEP_MIN, STEP_MAX);
}

/**
 * The size for `baseline` at `step`, in whole pixels.
 *
 * The walk from step 0 to `step` exists to guarantee a *visible* change per keypress:
 * rounding `baseline * ratio ** step` alone can produce the same integer twice in a row
 * for small baselines (10px at ratio 1.1 → 11, 12, 13 is fine, but 4px → 4, 4, 5 is not),
 * which reads as a broken keybinding. Each iteration therefore moves at least 1px until a
 * bound is hit. It stays a pure function of (baseline, ratio, step, min, max), so there is
 * still no state to drift.
 */
export function scaledSize(
  baseline: number,
  ratio: number,
  step: number,
  min: number,
  max: number
): number {
  const rounded = Math.round(baseline);
  if (step === 0) {
    return rounded;
  }

  const direction = step > 0 ? 1 : -1;
  const iterations = Math.abs(step);
  let ideal = rounded;
  let value = rounded;

  for (let i = 0; i < iterations; i += 1) {
    ideal = direction > 0 ? ideal * ratio : ideal / ratio;
    ideal = clamp(ideal, min, max);

    let next = Math.round(ideal);
    if (direction > 0 && next <= value) {
      next = value + 1;
    } else if (direction < 0 && next >= value) {
      next = value - 1;
    }
    value = clamp(next, min, max);
  }

  return value;
}

/**
 * The baseline to record for a target, given the value the setting currently reports.
 *
 * Three cases, in order:
 * - a real size → that is the user's 100%;
 * - unset or `0` on a target that inherits from `editor.fontSize` → `undefined`, so the
 *   target is skipped and keeps inheriting;
 * - unset or `0` elsewhere → the declared fallback, because the surface's consumer
 *   substitutes a hardcoded size of its own and would otherwise never scale.
 */
export function resolveBaseline(
  current: unknown,
  target: Pick<FontTarget, 'inheritsWhenZero' | 'baselineFallback'>
): number | undefined {
  if (typeof current === 'number' && Number.isFinite(current) && current > 0) {
    return current;
  }
  if (target.inheritsWhenZero) {
    return undefined;
  }
  return target.baselineFallback;
}

export interface SettingWrite {
  readonly setting: string;
  /** `undefined` removes the user-level value, restoring VS Code's own default. */
  readonly value: number | undefined;
  /**
   * The size the surface substitutes when this setting carries no value at all — carried
   * through from the target registry so the writer can tell a meaningful write from a
   * redundant one for settings that have no registered default (`chat.fontSize`).
   */
  readonly baselineFallback?: number;
}

export interface FontScaleInput {
  readonly targets: readonly FontTarget[];
  readonly baselines: Readonly<Record<string, number>>;
  readonly ratio: number;
  readonly step: number;
}

/**
 * The writes needed to put every target at `step`.
 *
 * Targets with no captured baseline are skipped (nothing to scale from), as are
 * `inheritsWhenZero` targets whose baseline is 0 — those already follow `editor.fontSize`
 * and are better left inheriting.
 */
export function computeFontWrites(input: FontScaleInput): SettingWrite[] {
  const { targets, baselines, ratio, step } = input;
  const writes: SettingWrite[] = [];

  for (const target of targets) {
    const baseline = baselines[target.setting];
    if (typeof baseline !== 'number' || !Number.isFinite(baseline)) {
      continue;
    }
    if (target.inheritsWhenZero && baseline === 0) {
      continue;
    }
    writes.push({
      setting: target.setting,
      value: scaledSize(baseline, ratio, step, target.min, target.max),
      baselineFallback: target.baselineFallback,
    });
  }

  return writes;
}

/**
 * Zoom level for a step, or `undefined` when the UI nudge is switched off.
 *
 * Deliberately small (ADR-0002): `window.zoomLevel` magnifies text too, so a full zoom
 * level per step would compound with the font increase. Its job is only to stop workbench
 * chrome — which has no font-size setting of its own — from falling behind.
 *
 * Offsetting from `baseline` rather than from 0 matters: a user who already ran VS Code at
 * `window.zoomLevel: 1` must land back on 1 after a reset, not on 0.
 */
export function zoomLevelForStep(
  baseline: number,
  step: number,
  perStep: number,
  enabled: boolean
): number | undefined {
  if (!enabled) {
    return undefined;
  }
  const level = clamp(baseline + step * perStep, ZOOM_LEVEL_MIN, ZOOM_LEVEL_MAX);
  // Two decimals: zoomLevel is a float setting and long tails only clutter settings.json.
  return Math.round(level * 100) / 100;
}

/** Percentage label for a step, e.g. `+21%` — used by the status bar and quick pick. */
export function scalePercentLabel(ratio: number, step: number): string {
  if (step === 0) {
    return '100%';
  }
  const percent = Math.round(ratio ** step * 100);
  return `${percent}%`;
}
