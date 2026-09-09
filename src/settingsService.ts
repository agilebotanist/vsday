import * as vscode from 'vscode';

/**
 * The single seam between VSDay's logic and the VS Code configuration API.
 *
 * Everything above this interface is testable without an extension host (ADR-0005), and
 * every write goes to User (Global) scope (ADR-0003) — which is also what makes a single
 * keypress take effect in every open window.
 */
export interface SettingsService {
  /** Effective value (user value if set, otherwise the default). */
  get<T>(key: string): T | undefined;
  getOr<T>(key: string, fallback: T): T;
  /** User-level value only; `undefined` when the user has not set one. */
  getUserValue<T>(key: string): T | undefined;
  /** The setting's own default, used to decide whether writing a value is redundant. */
  getDefaultValue<T>(key: string): T | undefined;
  /** False for settings no installed extension has contributed — writing those throws. */
  isRegistered(key: string): boolean;
  /** Writes at User (Global) scope. `undefined` removes the user-level value. */
  update(key: string, value: unknown): Promise<void>;
}

export class VscodeSettingsService implements SettingsService {
  private config(): vscode.WorkspaceConfiguration {
    // No section: keys are fully qualified, which keeps the target registry readable.
    return vscode.workspace.getConfiguration();
  }

  get<T>(key: string): T | undefined {
    return this.config().get<T>(key);
  }

  getOr<T>(key: string, fallback: T): T {
    const value = this.config().get<T>(key);
    return value === undefined ? fallback : value;
  }

  getUserValue<T>(key: string): T | undefined {
    return this.config().inspect<T>(key)?.globalValue;
  }

  getDefaultValue<T>(key: string): T | undefined {
    return this.config().inspect<T>(key)?.defaultValue;
  }

  isRegistered(key: string): boolean {
    return this.config().inspect(key) !== undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    await this.config().update(key, value, vscode.ConfigurationTarget.Global);
  }
}
