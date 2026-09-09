import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { defineConfig } from '@vscode/test-cli';

const root = path.dirname(fileURLToPath(import.meta.url));

// The integration tests write to *user* (global) settings on purpose — that is the
// behaviour under test. They must therefore never run against the developer's real
// profile: these throwaway directories isolate them. The paths must be absolute — the
// test host resolves relative ones against its own working directory, which on Windows
// is C:\Windows\system32. See docs/testing.md.
const profileDir = path.join(root, '.vscode-test-profile', 'user-data');
const extensionsDir = path.join(root, '.vscode-test-profile', 'extensions');

export default defineConfig({
  files: 'out/test/integration/**/*.test.js',
  version: 'stable',
  workspaceFolder: path.join(root, 'src', 'test', 'fixtures', 'workspace'),
  launchArgs: [
    `--user-data-dir=${profileDir}`,
    `--extensions-dir=${extensionsDir}`,
    '--disable-extensions',
    '--disable-gpu',
    '--disable-updates',
    '--skip-welcome',
    '--skip-release-notes',
  ],
  mocha: {
    ui: 'bdd',
    timeout: 30000,
  },
});
