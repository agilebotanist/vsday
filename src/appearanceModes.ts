/**
 * Appearance mode model — pure functions, no `vscode` import.
 *
 * A mode is a colour theme plus an optional set of comfort settings. The only subtle part
 * is leaving a mode cleanly: whatever a mode overrode has to go back to what the user had
 * before, including "had nothing set at all", or modes slowly silt up the user's
 * settings.json. `computeOverrideTransition` is that bookkeeping.
 */
export type ModeId = 'day' | 'night' | 'eyeSaving' | 'highContrast';
export type ActiveMode = ModeId | 'none';

export const MODE_IDS: readonly ModeId[] = ['day', 'night', 'eyeSaving', 'highContrast'];

export interface ModeDescriptor {
  readonly id: ModeId;
  readonly label: string;
  /**
   * Codicon id used in the menu. Only names that exist in the codicon font may be used —
   * an unknown one renders as the literal text `$(name)`. Notably there is no `sun`,
   * `moon` or `contrast` codicon.
   */
  readonly icon: string;
  readonly description: string;
}

export const MODE_DESCRIPTORS: Readonly<Record<ModeId, ModeDescriptor>> = {
  day: {
    id: 'day',
    label: 'Day',
    icon: 'lightbulb',
    description: 'Light theme for a bright room',
  },
  night: {
    id: 'night',
    label: 'Night',
    icon: 'circle-large-filled',
    description: 'Dark theme for a dim room',
  },
  eyeSaving: {
    id: 'eyeSaving',
    label: 'Eye-Saving',
    icon: 'eye',
    description: 'Warm, low-blue-light theme for long reading',
  },
  highContrast: {
    id: 'highContrast',
    label: 'High Contrast',
    icon: 'color-mode',
    description: 'Warm ground with maximum contrast and heavier text',
  },
};

export const SEPIA_THEME = 'VSDay Sepia (Warm Light)';
export const WARM_DARK_THEME = 'VSDay Warm Dark';
export const SEPIA_HC_THEME = 'VSDay Sepia High Contrast';

/**
 * Theme candidates per mode, best first, used when a mode's theme setting is left empty.
 *
 * VS Code has renamed its own default themes more than once — the ids were
 * `Default Dark Modern`, then `Dark Modern`, and 1.136 ships `Dark 2026` out of the box —
 * so pinning any single name breaks on some supported version. Trying a list and keeping
 * the first one that is actually installed works across the whole `^1.85.0` range.
 */
export const THEME_FALLBACKS: Readonly<Record<ModeId, readonly string[]>> = {
  day: ['Light 2026', 'Light Modern', 'Default Light Modern', 'Light+', 'Visual Studio Light'],
  night: ['Dark 2026', 'Dark Modern', 'Default Dark Modern', 'Dark+', 'Visual Studio Dark'],
  eyeSaving: [SEPIA_THEME, WARM_DARK_THEME],
  highContrast: [SEPIA_HC_THEME, 'Default High Contrast Light', 'Default High Contrast'],
};

export function isModeId(value: unknown): value is ModeId {
  return typeof value === 'string' && (MODE_IDS as readonly string[]).includes(value);
}

/** Sanitises `vsday.mode.cycleOrder`: keeps known ids, drops duplicates, never returns empty. */
export function normalizeCycleOrder(order: readonly unknown[] | undefined): ModeId[] {
  const seen = new Set<ModeId>();
  for (const entry of order ?? []) {
    if (isModeId(entry)) {
      seen.add(entry);
    }
  }
  return seen.size > 0 ? [...seen] : [...MODE_IDS];
}

/** The next mode in the cycle. An unset or unknown current mode starts the cycle over. */
export function nextMode(order: readonly unknown[] | undefined, current: ActiveMode): ModeId {
  const cycle = normalizeCycleOrder(order);
  const index = isModeId(current) ? cycle.indexOf(current) : -1;
  if (index === -1) {
    return cycle[0];
  }
  return cycle[(index + 1) % cycle.length];
}

/**
 * Settings a mode is not allowed to override, because VSDay or the mode machinery already
 * owns them. Silently letting a mode set `editor.fontSize` would fight the font scaler on
 * every keypress.
 */
export function isReservedOverrideKey(key: string, fontSettings: readonly string[]): boolean {
  return (
    key === 'workbench.colorTheme' ||
    key === 'window.zoomLevel' ||
    key.startsWith('vsday.') ||
    fontSettings.includes(key)
  );
}

export interface OverrideCandidates {
  readonly accepted: Record<string, unknown>;
  readonly rejected: string[];
}

/** Splits a mode's declared settings into what we will apply and what we refuse. */
export function partitionOverrides(
  declared: Readonly<Record<string, unknown>> | undefined,
  fontSettings: readonly string[]
): OverrideCandidates {
  const accepted: Record<string, unknown> = {};
  const rejected: string[] = [];

  for (const [key, value] of Object.entries(declared ?? {})) {
    if (isReservedOverrideKey(key, fontSettings)) {
      rejected.push(key);
    } else {
      accepted[key] = value;
    }
  }

  return { accepted, rejected };
}

/**
 * `null` records "the user had no explicit value here", which must be restored by
 * *removing* our value rather than writing one. Stored in globalState, so JSON-safe.
 */
export type TrackedOriginals = Record<string, unknown | null>;

export interface SettingAssignment {
  readonly key: string;
  /** `undefined` removes the user-level value. */
  readonly value: unknown | undefined;
}

export interface OverrideTransition {
  /** Keys the outgoing mode owned that the incoming one does not — applied first. */
  readonly restores: SettingAssignment[];
  /** The incoming mode's overrides. */
  readonly applies: SettingAssignment[];
  /** What to persist as the new "originals" record. */
  readonly nextOriginals: TrackedOriginals;
}

/**
 * Works out how to move from the currently-tracked overrides to `desired`.
 *
 * `readUserValue` returns the user-level value of a setting, or `undefined` when the user
 * has none. It is only consulted for keys we are not already tracking — a key we already
 * track holds a value *we* wrote, so reading it now would capture our own override as if
 * it were the user's.
 */
export function computeOverrideTransition(
  tracked: TrackedOriginals | undefined,
  desired: Readonly<Record<string, unknown>>,
  readUserValue: (key: string) => unknown | undefined
): OverrideTransition {
  const current = tracked ?? {};
  const restores: SettingAssignment[] = [];
  const applies: SettingAssignment[] = [];
  const nextOriginals: TrackedOriginals = {};

  for (const [key, original] of Object.entries(current)) {
    if (key in desired) {
      nextOriginals[key] = original;
    } else {
      restores.push({ key, value: original === null ? undefined : original });
    }
  }

  for (const [key, value] of Object.entries(desired)) {
    if (!(key in nextOriginals)) {
      const userValue = readUserValue(key);
      nextOriginals[key] = userValue === undefined ? null : userValue;
    }
    applies.push({ key, value });
  }

  return { restores, applies, nextOriginals };
}

/** The transition that drops every override and keeps nothing tracked. */
export function computeOverrideReset(tracked: TrackedOriginals | undefined): OverrideTransition {
  return computeOverrideTransition(tracked, {}, () => undefined);
}
