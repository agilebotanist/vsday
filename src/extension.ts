import * as vscode from 'vscode';
import { AppearanceController } from './appearanceController';
import { registerCommands } from './commands';
import { CONFIG, CONFIG_ROOT } from './config';
import { FontScaleController } from './fontScaleController';
import { createLogger } from './logger';
import { Logger } from './logging';
import { SettingsService, VscodeSettingsService } from './settingsService';
import { VSDayStatusBar } from './statusBar';

/** Exposed for the integration tests; the extension host only needs `activate`. */
export interface VSDayApi {
  readonly fontScale: FontScaleController;
  readonly appearance: AppearanceController;
  readonly settings: SettingsService;
  readonly statusBar: VSDayStatusBar;
  readonly logger: Logger;
}

export function activate(context: vscode.ExtensionContext): VSDayApi {
  const logger = createLogger();
  const settings = new VscodeSettingsService();

  const fontScale = new FontScaleController(settings, logger);
  const appearance = new AppearanceController(settings, context.globalState, logger, () =>
    fontScale.targets().map((target) => target.setting)
  );
  const statusBar = new VSDayStatusBar(settings);

  const refresh = (): void => {
    try {
      statusBar.refresh(fontScale.state(), appearance.activeMode());
    } catch (error) {
      logger.error('Failed to refresh the status bar', error);
    }
  };

  context.subscriptions.push(
    logger,
    statusBar,
    ...registerCommands({ fontScale, appearance, settings, logger, refresh }),
    // Settings can also be edited by hand, or changed by another window — the indicator
    // must follow, since every VSDay write is global and therefore cross-window.
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration(CONFIG_ROOT)) {
        return;
      }
      // Switching strategy changes what the current step *means*, so re-apply it rather
      // than leaving the previous strategy's writes in place. This cannot loop: applying a
      // step never writes the strategy setting.
      //
      // Only react when the strategy has been *set*, never when it has been cleared: a
      // cleared value is what a bulk settings reset looks like part-way through, and
      // writing sizes back in the middle of one would fight whoever is doing the resetting.
      if (
        event.affectsConfiguration(CONFIG.scaleStrategy) &&
        settings.getUserValue(CONFIG.scaleStrategy) !== undefined
      ) {
        void fontScale
          .reconcile()
          .catch((error) => logger.error('Failed to re-apply after a strategy change', error))
          .finally(refresh);
        return;
      }
      refresh();
    })
  );

  refresh();

  // An upgrade can add a surface that has never been scaled, and settings.json can be
  // edited between sessions; bring both into line with the recorded step.
  void fontScale
    .reconcile()
    .catch((error) => logger.error('Failed to reconcile settings on activation', error))
    .finally(refresh);

  logger.info('VSDay activated');

  return { fontScale, appearance, settings, statusBar, logger };
}

export function deactivate(): void {
  // Nothing to tear down beyond context.subscriptions.
}
