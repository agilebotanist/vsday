import * as vscode from 'vscode';
import { AppearanceController } from './appearanceController';
import { registerCommands } from './commands';
import { CONFIG_ROOT } from './config';
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
      if (event.affectsConfiguration(CONFIG_ROOT)) {
        refresh();
      }
    })
  );

  refresh();
  logger.info('VSDay activated');

  return { fontScale, appearance, settings, statusBar, logger };
}

export function deactivate(): void {
  // Nothing to tear down beyond context.subscriptions.
}
