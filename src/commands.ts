import * as vscode from 'vscode';
import { AppearanceController } from './appearanceController';
import { MODE_DESCRIPTORS, MODE_IDS, ModeId, isModeId } from './appearanceModes';
import { CONFIG } from './config';
import { scaledSize } from './fontScale';
import { FontScaleController } from './fontScaleController';
import { EDITOR_FONT_SIZE, STEP_MAX, STEP_MIN } from './fontTargets';
import { Logger } from './logging';
import { SettingsService } from './settingsService';

export interface CommandDependencies {
  readonly fontScale: FontScaleController;
  readonly appearance: AppearanceController;
  readonly settings: SettingsService;
  readonly logger: Logger;
  /** Called after any state-changing command so the status bar stays in step. */
  readonly refresh: () => void;
}

export function registerCommands(deps: CommandDependencies): vscode.Disposable[] {
  const { fontScale, appearance, logger, refresh } = deps;

  const run = (action: () => Promise<unknown>) => async (): Promise<void> => {
    try {
      await action();
    } catch (error) {
      logger.error('Command failed', error);
      void vscode.window.showErrorMessage(
        `VSDay: ${error instanceof Error ? error.message : String(error)} — see the VSDay output channel.`
      );
    } finally {
      refresh();
    }
  };

  const register = (command: string, action: () => Promise<unknown>): vscode.Disposable =>
    vscode.commands.registerCommand(command, run(action));

  return [
    register('vsday.increaseFontSize', () => fontScale.increase()),
    register('vsday.decreaseFontSize', () => fontScale.decrease()),
    register('vsday.resetFontSize', () => fontScale.reset()),
    register('vsday.captureBaseline', async () => {
      await fontScale.captureBaseline();
      void vscode.window.showInformationMessage(
        'VSDay: current font sizes are now the 100% baseline.'
      );
    }),
    register('vsday.setFontScale', () => pickFontScale(deps)),
    register('vsday.toggleScaleStrategy', async () => {
      const strategy = await fontScale.toggleStrategy();
      void vscode.window.showInformationMessage(
        strategy === 'uniform'
          ? 'VSDay: scaling everything by window zoom — every pane and extension view grows together.'
          : 'VSDay: scaling font settings — sharper text, but panes without a font size (Explorer, Extensions view) will lag behind.'
      );
    }),
    register('vsday.setAppearanceMode', () => pickAppearanceMode(deps)),
    register('vsday.cycleAppearanceMode', () => appearance.cycle()),
    register('vsday.setDayMode', () => appearance.applyMode('day')),
    register('vsday.setNightMode', () => appearance.applyMode('night')),
    register('vsday.setEyeSavingMode', () => appearance.applyMode('eyeSaving')),
    register('vsday.setHighContrastMode', () => appearance.applyMode('highContrast')),
    register('vsday.resetAll', async () => {
      await fontScale.reset();
      await appearance.reset();
    }),
    register('vsday.showMenu', () => showMenu(deps)),
    register('vsday.showLog', async () => logger.show()),
  ];
}

interface StepItem extends vscode.QuickPickItem {
  readonly step: number;
}

async function pickFontScale(deps: CommandDependencies): Promise<void> {
  const { fontScale, settings } = deps;
  const state = fontScale.state();
  const baselines = settings.getOr<Record<string, number>>(CONFIG.baselines, {});
  const editorBaseline =
    baselines[EDITOR_FONT_SIZE] ?? settings.get<number>(EDITOR_FONT_SIZE) ?? 14;
  const ratio = settings.getOr<number>(CONFIG.ratio, 1.1);

  // A usable slice of the supported range rather than all 41 steps; the setting itself
  // still accepts STEP_MIN..STEP_MAX for anyone who wants the extremes.
  const highest = Math.min(STEP_MAX, 12);
  const lowest = Math.max(STEP_MIN, -8);
  const items: StepItem[] = [];
  for (let step = highest; step >= lowest; step -= 1) {
    const percent = Math.round(ratio ** step * 100);
    items.push({
      step,
      label: `${percent}%`,
      description: `editor ${scaledSize(editorBaseline, ratio, step, 4, 100)}px${
        step === state.step ? ' — current' : ''
      }`,
    });
  }

  const choice = await vscode.window.showQuickPick(items, {
    title: 'VSDay: Set Font Scale',
    placeHolder: `Current: ${state.percentLabel} (step ${state.step})`,
    matchOnDescription: true,
  });

  if (choice) {
    await fontScale.applyStep(choice.step);
  }
}

interface ModeItem extends vscode.QuickPickItem {
  readonly mode: ModeId | 'none';
}

async function pickAppearanceMode(deps: CommandDependencies): Promise<void> {
  const { appearance } = deps;
  const active = appearance.activeMode();

  const items: ModeItem[] = MODE_IDS.map((id) => {
    const descriptor = MODE_DESCRIPTORS[id];
    const theme = appearance.themeFor(id);
    return {
      mode: id,
      label: `$(${descriptor.icon}) ${descriptor.label}`,
      description: theme || 'no theme configured',
      detail: id === active ? `Active — ${descriptor.description}` : descriptor.description,
    };
  });

  items.push({
    mode: 'none',
    label: '$(circle-slash) No mode',
    description: 'revert this mode’s settings, keep the current theme',
  });

  const choice = await vscode.window.showQuickPick(items, {
    title: 'VSDay: Appearance Mode',
    placeHolder: isModeId(active) ? `Active: ${MODE_DESCRIPTORS[active].label}` : 'No mode active',
  });

  if (!choice) {
    return;
  }
  if (choice.mode === 'none') {
    await appearance.reset();
  } else {
    await appearance.applyMode(choice.mode);
  }
}

interface MenuItem extends vscode.QuickPickItem {
  readonly command?: string;
}

async function showMenu(deps: CommandDependencies): Promise<void> {
  const state = deps.fontScale.state();
  const active = deps.appearance.activeMode();

  const items: MenuItem[] = [
    { label: 'Text size', kind: vscode.QuickPickItemKind.Separator },
    {
      label: '$(add) Increase font size',
      description: `${state.percentLabel} → larger`,
      command: 'vsday.increaseFontSize',
    },
    {
      label: '$(dash) Decrease font size',
      description: `${state.percentLabel} → smaller`,
      command: 'vsday.decreaseFontSize',
    },
    {
      label: '$(circle-filled) Reset font size to 100%',
      description: state.step === 0 ? 'already at 100%' : `currently ${state.percentLabel}`,
      command: 'vsday.resetFontSize',
    },
    { label: '$(list-selection) Set font scale…', command: 'vsday.setFontScale' },
    {
      label: '$(pin) Use current sizes as the new 100%',
      command: 'vsday.captureBaseline',
    },
    {
      label:
        state.strategy === 'uniform'
          ? '$(zoom-in) Scaling: everything (window zoom)'
          : '$(text-size) Scaling: text only (font settings)',
      description:
        state.strategy === 'uniform'
          ? 'click to scale font settings instead — sharper text, but Explorer and extension views lag'
          : 'click to scale everything instead — every pane and extension view grows together',
      command: 'vsday.toggleScaleStrategy',
    },
    { label: 'Appearance', kind: vscode.QuickPickItemKind.Separator },
    ...MODE_IDS.map((id) => ({
      label: `$(${MODE_DESCRIPTORS[id].icon}) ${MODE_DESCRIPTORS[id].label} mode`,
      description: id === active ? 'active' : deps.appearance.themeFor(id),
      command: `vsday.set${id.charAt(0).toUpperCase()}${id.slice(1)}Mode`,
    })),
    { label: 'Other', kind: vscode.QuickPickItemKind.Separator },
    { label: '$(discard) Reset everything', command: 'vsday.resetAll' },
    { label: '$(gear) VSDay settings', command: 'vsday.openSettings' },
    { label: '$(output) Show VSDay log', command: 'vsday.showLog' },
  ];

  const choice = await vscode.window.showQuickPick(items, {
    title: `VSDay — ${state.percentLabel}, ${isModeId(active) ? MODE_DESCRIPTORS[active].label : 'no'} mode`,
    placeHolder: 'Pick an action',
  });

  if (!choice?.command) {
    return;
  }
  if (choice.command === 'vsday.openSettings') {
    await vscode.commands.executeCommand(
      'workbench.action.openSettings',
      '@ext:agilebotanist.vsday'
    );
    return;
  }
  await vscode.commands.executeCommand(choice.command);
}
