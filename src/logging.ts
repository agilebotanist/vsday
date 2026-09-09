/**
 * Logging contract, kept free of any `vscode` import so the modules that log can still be
 * unit-tested outside an extension host (ADR-0005).
 */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
  show(): void;
  dispose(): void;
}

/** A logger that swallows everything — used by unit tests. */
export const nullLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  show: () => undefined,
  dispose: () => undefined,
};

/** Collects messages in memory, so a test can assert on what was reported. */
export function createMemoryLogger(): Logger & { readonly messages: string[] } {
  const messages: string[] = [];
  return {
    messages,
    info: (message) => messages.push(`INFO ${message}`),
    warn: (message) => messages.push(`WARN ${message}`),
    error: (message) => messages.push(`ERROR ${message}`),
    show: () => undefined,
    dispose: () => undefined,
  };
}
