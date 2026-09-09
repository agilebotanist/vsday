import * as vscode from 'vscode';
import { Logger } from './logging';

export { nullLogger } from './logging';
export type { Logger } from './logging';

/** The real logger: an output channel named "VSDay". No telemetry, ever. */
export function createLogger(name = 'VSDay'): Logger {
  const channel = vscode.window.createOutputChannel(name);

  const write = (level: string, message: string): void => {
    channel.appendLine(`[${new Date().toISOString()}] ${level} ${message}`);
  };

  return {
    info: (message) => write('INFO ', message),
    warn: (message) => write('WARN ', message),
    error: (message, error) => {
      write('ERROR', message);
      if (error !== undefined) {
        write('ERROR', error instanceof Error ? (error.stack ?? error.message) : String(error));
      }
    },
    show: () => channel.show(true),
    dispose: () => channel.dispose(),
  };
}
