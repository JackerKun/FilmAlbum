import { readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)),
  directory = new URL('../tests/', import.meta.url);
const files = readdirSync(directory)
  .filter((name) => /^test-.*\.mjs$/.test(name))
  .sort()
  .map((name) => fileURLToPath(new URL(name, directory)));
const child = spawn(
  process.execPath,
  ['--test', '--test-timeout=180000', '--test-reporter=tap', ...process.argv.slice(2), ...files],
  {
    cwd: root,
    stdio: 'inherit',
  },
);
child.once('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
