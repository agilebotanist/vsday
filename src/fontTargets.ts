/**
 * Registry of the settings VSDay scales.
 *
 * VS Code has no single "text size" setting: every surface owns its own. This list is
 * the complete set of built-in font-size settings a reader cares about, and it is the
 * only place a new surface needs to be added.
 *
 * Pure data — no `vscode` import — so it can be unit-tested without an extension host.
 */
export interface FontTarget {
  /** Fully-qualified setting id, e.g. `terminal.integrated.fontSize`. */
  readonly setting: string;
  /** Human label, used in the log and the quick pick. */
  readonly label: string;
  /** Smallest value we will ever write. */
  readonly min: number;
  /** Largest value we will ever write. */
  readonly max: number;
  /**
   * When true, a value of `0` means "inherit from `editor.fontSize`". Such a target is
   * skipped while its baseline is `0`, so we preserve the inheritance instead of freezing
   * a concrete number the user never asked for.
   */
  readonly inheritsWhenZero?: boolean;
  /**
   * Baseline to assume when the setting is unset or `0` **and** nothing derives it from
   * `editor.fontSize`. Needed for surfaces whose consumer falls back to a hardcoded size
   * of its own: leaving those unset means they never scale at all. Mutually exclusive with
   * `inheritsWhenZero`.
   */
  readonly baselineFallback?: number;
}

export const EDITOR_FONT_SIZE = 'editor.fontSize';
export const WINDOW_ZOOM_LEVEL = 'window.zoomLevel';

export const BUILT_IN_FONT_TARGETS: readonly FontTarget[] = [
  { setting: EDITOR_FONT_SIZE, label: 'Editor', min: 4, max: 100 },
  { setting: 'terminal.integrated.fontSize', label: 'Terminal', min: 6, max: 100 },
  { setting: 'debug.console.fontSize', label: 'Debug console', min: 4, max: 100 },
  { setting: 'markdown.preview.fontSize', label: 'Markdown preview', min: 4, max: 100 },
  { setting: 'scm.inputFontSize', label: 'Source control input', min: 4, max: 100 },
  {
    // The chat *body* text — every chat webview built on VS Code's chat settings, the
    // Claude Code panel included. Its consumers read `chat.fontSize` and fall back to a
    // hardcoded 13px when it is unset, so unlike the widget sizes below there is nothing
    // to inherit from: the setting has to be written for the chat to scale at all.
    setting: 'chat.fontSize',
    label: 'Chat',
    min: 4,
    max: 100,
    baselineFallback: 13,
  },
  {
    // Code blocks inside chat. Separate setting, separate consumer.
    setting: 'chat.editor.fontSize',
    label: 'Chat code blocks',
    min: 4,
    max: 100,
    baselineFallback: 12,
  },
  {
    setting: 'notebook.output.fontSize',
    label: 'Notebook output',
    min: 0,
    max: 100,
    inheritsWhenZero: true,
  },
  {
    setting: 'notebook.markup.fontSize',
    label: 'Notebook Markdown cells',
    min: 0,
    max: 100,
    inheritsWhenZero: true,
  },
  {
    setting: 'editor.suggestFontSize',
    label: 'Suggestion widget',
    min: 0,
    max: 100,
    inheritsWhenZero: true,
  },
  {
    setting: 'editor.codeLens.fontSize',
    label: 'CodeLens',
    min: 0,
    max: 100,
    inheritsWhenZero: true,
  },
  {
    setting: 'editor.inlayHints.fontSize',
    label: 'Inlay hints',
    min: 0,
    max: 100,
    inheritsWhenZero: true,
  },
];

/**
 * Bounds applied to `window.zoomLevel`. VS Code itself clamps well beyond this, but a
 * runaway zoom can leave the workbench unusable and hard to recover from by mouse alone.
 */
export const ZOOM_LEVEL_MIN = -5;
export const ZOOM_LEVEL_MAX = 5;

/** Bounds applied to the scale step, mirroring the `vsday.fontScale.step` schema. */
export const STEP_MIN = -20;
export const STEP_MAX = 20;

/**
 * Combines the built-in targets with any user-declared extras.
 *
 * Extras get permissive bounds and no inheritance rule: we know nothing about a
 * third-party setting beyond its id.
 */
export function resolveFontTargets(extraSettings: readonly string[] = []): FontTarget[] {
  const targets = [...BUILT_IN_FONT_TARGETS];
  const known = new Set(targets.map((target) => target.setting));

  for (const setting of extraSettings) {
    const trimmed = setting.trim();
    if (trimmed.length === 0 || known.has(trimmed)) {
      continue;
    }
    known.add(trimmed);
    targets.push({ setting: trimmed, label: trimmed, min: 4, max: 100 });
  }

  return targets;
}
