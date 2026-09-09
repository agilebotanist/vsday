import * as vscode from 'vscode';
import { ActiveMode, MODE_DESCRIPTORS, ModeId, isModeId, nextMode } from './appearanceModes';
import { CONFIG } from './config';
import { FontScaleState } from './fontScaleController';
import { SettingsService } from './settingsService';

export type ResetDotVisibility = 'auto' | 'always' | 'never';

/**
 * What the status bar is currently showing. VS Code offers no way to read the workbench
 * back, so the items report their own state for the integration tests to assert on.
 */
export interface StatusBarSnapshot {
  readonly decreaseVisible: boolean;
  readonly scaleText: string;
  readonly scaleVisible: boolean;
  readonly increaseVisible: boolean;
  readonly resetDotVisible: boolean;
  readonly modeText: string;
  readonly modeVisible: boolean;
  /** Command each item invokes, keyed by item id — the click contract, under test. */
  readonly commands: Readonly<Record<string, string | undefined>>;
}

const EMPTY_SNAPSHOT: StatusBarSnapshot = {
  decreaseVisible: false,
  scaleText: '',
  scaleVisible: false,
  increaseVisible: false,
  resetDotVisible: false,
  modeText: '',
  modeVisible: false,
  commands: {},
};

/**
 * A small toolbar in the status bar:
 *
 * ```
 *   −   $(text-size) 110%   +   ●   $(eye) Eye-Saving
 *   ↑         ↑             ↑   ↑        ↑
 * smaller   menu        bigger reset  next mode
 * ```
 *
 * Right-aligned items are ordered by descending priority, so the priorities below read
 * left to right. Two behaviours are deliberate:
 *
 * - the reset dot appears only while the scale is off baseline, so it doubles as the
 *   indicator that you are scaled at all;
 * - the mode item **cycles** on click rather than opening a picker — one click, next mode —
 *   with its tooltip naming where the click will take you.
 */
export class VSDayStatusBar implements vscode.Disposable {
  private readonly decrease: vscode.StatusBarItem;
  private readonly scale: vscode.StatusBarItem;
  private readonly increase: vscode.StatusBarItem;
  private readonly resetDot: vscode.StatusBarItem;
  private readonly mode: vscode.StatusBarItem;
  private readonly items: vscode.StatusBarItem[];
  private snapshotState: StatusBarSnapshot = EMPTY_SNAPSHOT;

  constructor(private readonly settings: SettingsService) {
    this.decrease = this.createItem('vsday.decrease', 'VSDay: Decrease Font Size', 105);
    this.decrease.text = '$(dash)';
    this.decrease.command = 'vsday.decreaseFontSize';
    this.decrease.accessibilityInformation = {
      label: 'Decrease font size everywhere',
      role: 'button',
    };

    this.scale = this.createItem('vsday.main', 'VSDay', 104);
    this.scale.command = 'vsday.showMenu';

    this.increase = this.createItem('vsday.increase', 'VSDay: Increase Font Size', 103);
    this.increase.text = '$(add)';
    this.increase.command = 'vsday.increaseFontSize';
    this.increase.accessibilityInformation = {
      label: 'Increase font size everywhere',
      role: 'button',
    };

    this.resetDot = this.createItem('vsday.reset', 'VSDay: Reset Font Size', 102);
    this.resetDot.text = '$(circle-filled)';
    this.resetDot.command = 'vsday.resetFontSize';
    this.resetDot.accessibilityInformation = {
      label: 'Reset VSDay font size to 100 percent',
      role: 'button',
    };

    this.mode = this.createItem('vsday.mode', 'VSDay: Appearance Mode', 101);
    this.mode.command = 'vsday.cycleAppearanceMode';

    this.items = [this.decrease, this.scale, this.increase, this.resetDot, this.mode];
  }

  private createItem(id: string, name: string, priority: number): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(id, vscode.StatusBarAlignment.Right, priority);
    item.name = name;
    return item;
  }

  snapshot(): StatusBarSnapshot {
    return this.snapshotState;
  }

  refresh(font: FontScaleState, mode: ActiveMode): void {
    if (this.settings.getOr<boolean>(CONFIG.statusBarEnabled, true) !== true) {
      for (const item of this.items) {
        item.hide();
      }
      this.snapshotState = EMPTY_SNAPSHOT;
      return;
    }

    const showButtons = this.settings.getOr<boolean>(CONFIG.showStepButtons, true);
    const showMode = this.settings.getOr<boolean>(CONFIG.showModeButton, true);
    const showDot = this.shouldShowResetDot(font);

    this.decrease.tooltip = `VSDay: decrease font size everywhere (currently ${font.percentLabel})`;
    this.increase.tooltip = `VSDay: increase font size everywhere (currently ${font.percentLabel})`;
    this.resetDot.tooltip = `VSDay: reset font size to 100% (currently ${font.percentLabel})`;

    this.scale.text = `$(text-size) ${font.percentLabel}`;
    this.scale.tooltip = this.buildScaleTooltip(font, mode);
    this.scale.accessibilityInformation = {
      label: `VSDay: text at ${font.percentLabel}`,
      role: 'button',
    };

    const upcoming = nextMode(this.settings.get<unknown[]>(CONFIG.cycleOrder), mode);
    this.mode.text = this.modeText(mode);
    this.mode.tooltip = this.buildModeTooltip(mode, upcoming);
    this.mode.accessibilityInformation = {
      label: `VSDay appearance mode: ${isModeId(mode) ? MODE_DESCRIPTORS[mode].label : 'none'}. Activate to switch to ${MODE_DESCRIPTORS[upcoming].label}.`,
      role: 'button',
    };

    this.setVisible(this.decrease, showButtons);
    this.setVisible(this.scale, true);
    this.setVisible(this.increase, showButtons);
    this.setVisible(this.resetDot, showDot);
    this.setVisible(this.mode, showMode);

    this.snapshotState = {
      decreaseVisible: showButtons,
      scaleText: this.scale.text,
      scaleVisible: true,
      increaseVisible: showButtons,
      resetDotVisible: showDot,
      modeText: this.mode.text,
      modeVisible: showMode,
      commands: {
        'vsday.decrease': this.decrease.command as string | undefined,
        'vsday.main': this.scale.command as string | undefined,
        'vsday.increase': this.increase.command as string | undefined,
        'vsday.reset': this.resetDot.command as string | undefined,
        'vsday.mode': this.mode.command as string | undefined,
      },
    };
  }

  private setVisible(item: vscode.StatusBarItem, visible: boolean): void {
    if (visible) {
      item.show();
    } else {
      item.hide();
    }
  }

  private modeText(mode: ActiveMode): string {
    if (!isModeId(mode)) {
      return '$(color-mode) Mode';
    }
    const descriptor = MODE_DESCRIPTORS[mode];
    return `$(${descriptor.icon}) ${descriptor.label}`;
  }

  private shouldShowResetDot(font: FontScaleState): boolean {
    const visibility = this.settings.getOr<ResetDotVisibility>(CONFIG.showResetDot, 'auto');
    if (visibility === 'never') {
      return false;
    }
    if (visibility === 'always') {
      return true;
    }
    return font.step !== 0;
  }

  private buildScaleTooltip(font: FontScaleState, mode: ActiveMode): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString(undefined, true);
    tooltip.appendMarkdown(`**VSDay** — text at **${font.percentLabel}**\n\n`);
    tooltip.appendMarkdown(
      font.strategy === 'uniform'
        ? `- Scaling **everything** by window zoom (font sizes stay at \`${font.editorFontSize}px\`)\n`
        : `- Scaling **text only** — editor font size \`${font.editorFontSize}px\`\n`
    );
    tooltip.appendMarkdown(`- Scale step: \`${font.step}\`\n`);
    tooltip.appendMarkdown(
      `- Appearance mode: ${isModeId(mode) ? MODE_DESCRIPTORS[mode].label : 'none'}\n\n`
    );
    tooltip.appendMarkdown('Click for the VSDay menu.');
    return tooltip;
  }

  private buildModeTooltip(mode: ActiveMode, upcoming: ModeId): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString(undefined, true);
    const current = isModeId(mode) ? MODE_DESCRIPTORS[mode].label : 'none';
    tooltip.appendMarkdown(`**VSDay appearance mode** — ${current}\n\n`);
    tooltip.appendMarkdown(`Click to switch to **${MODE_DESCRIPTORS[upcoming].label}**`);
    tooltip.appendMarkdown(` — ${MODE_DESCRIPTORS[upcoming].description}.`);
    return tooltip;
  }

  dispose(): void {
    for (const item of this.items) {
      item.dispose();
    }
  }
}
