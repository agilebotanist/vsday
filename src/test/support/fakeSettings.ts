import { SettingsService } from '../../settingsService';

/**
 * In-memory stand-in for VS Code's configuration, with the two distinctions that matter
 * to VSDay: defaults vs. user values, and registered vs. unknown settings (writing an
 * unknown setting throws in the real API, so the fake throws too).
 */
export class FakeSettingsService implements SettingsService {
  readonly writes: { key: string; value: unknown }[] = [];

  private readonly defaults = new Map<string, unknown>();
  private readonly userValues = new Map<string, unknown>();
  private readonly registered = new Set<string>();

  constructor(defaults: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(defaults)) {
      this.defaults.set(key, value);
      this.registered.add(key);
    }
  }

  /** Declares a setting as existing with a default, mirroring a package.json contribution. */
  register(key: string, defaultValue?: unknown): this {
    this.registered.add(key);
    if (defaultValue !== undefined) {
      this.defaults.set(key, defaultValue);
    }
    return this;
  }

  /** Seeds a user-level value without recording it as a write. */
  seedUserValue(key: string, value: unknown): this {
    this.registered.add(key);
    this.userValues.set(key, value);
    return this;
  }

  get<T>(key: string): T | undefined {
    if (this.userValues.has(key)) {
      return this.userValues.get(key) as T;
    }
    return this.defaults.get(key) as T | undefined;
  }

  getOr<T>(key: string, fallback: T): T {
    const value = this.get<T>(key);
    return value === undefined ? fallback : value;
  }

  getUserValue<T>(key: string): T | undefined {
    return this.userValues.get(key) as T | undefined;
  }

  getDefaultValue<T>(key: string): T | undefined {
    return this.defaults.get(key) as T | undefined;
  }

  isRegistered(key: string): boolean {
    return this.registered.has(key);
  }

  async update(key: string, value: unknown): Promise<void> {
    if (!this.registered.has(key)) {
      throw new Error(
        `Unable to write to Global Settings because ${key} is not a registered configuration.`
      );
    }
    this.writes.push({ key, value });
    if (value === undefined) {
      this.userValues.delete(key);
    } else {
      this.userValues.set(key, value);
    }
  }
}
