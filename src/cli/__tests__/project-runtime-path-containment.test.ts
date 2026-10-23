import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { posix, win32 } from 'node:path';
import { describe, it } from 'node:test';
import { runInNewContext } from 'node:vm';

// Exercise the actual private helper with both path implementations on any host.
// Read the source rather than duplicate its logic or change the public API.
// This relative path works from both src/cli/__tests__ and dist/cli/__tests__.
const source = readFileSync(
  new URL('../../../src/cli/project-runtime-codex-homes.ts', import.meta.url),
  'utf8',
);
const helper = source.match(
  /function isPathWithin\(candidatePath: string, rootPath: string\): boolean \{([\s\S]*?)\n\}/,
);
assert.ok(helper, 'Expected the production isPathWithin helper');

type Case = [name: string, candidate: string, root: string, expected: boolean];
const cases: Record<'posix' | 'win32', Case[]> = {
  posix: [
    ['same directory', '/runs', '/runs', true],
    ['child directory', '/runs/run-1', '/runs', true],
    ['nested directory', '/runs/run-1/a', '/runs', true],
    ['sibling sharing prefix', '/runs-backup/run-1', '/runs', false],
    ['parent directory', '/', '/runs', false],
    ['unrelated directory', '/other/run-1', '/runs', false],
    ['normalized child', '/runs/a/../b', '/runs', true],
    ['normalized escape', '/runs/../../etc', '/runs', false],
    ['filesystem root', '/runs', '/', true],
    ['two-dot name', '/runs/..notes', '/runs', true],
    ['case sensitivity', '/RUNS/a', '/runs', false],
    ['Unicode child', '/runs/运行', '/runs', true],
  ],
  win32: [
    ['same directory', 'C:\\runs', 'C:\\runs', true],
    ['child directory', 'C:\\runs\\run-1', 'C:\\runs', true],
    ['nested directory', 'C:\\runs\\run-1\\a', 'C:\\runs', true],
    ['sibling sharing prefix', 'C:\\runs-backup\\run-1', 'C:\\runs', false],
    ['parent directory', 'C:\\', 'C:\\runs', false],
    ['unrelated directory', 'C:\\other\\run-1', 'C:\\runs', false],
    ['different drive', 'D:\\runs\\run-1', 'C:\\runs', false],
    ['normalized child', 'C:\\runs\\a\\..\\b', 'C:\\runs', true],
    ['normalized escape', 'C:\\runs\\..\\other', 'C:\\runs', false],
    ['drive root', 'C:\\runs', 'C:\\', true],
    ['case insensitivity', 'c:\\RUNS\\run-1', 'C:\\runs', true],
    ['UNC child', '\\\\server\\share\\runs\\run-1', '\\\\server\\share\\runs', true],
    ['different UNC share', '\\\\server\\other\\runs\\run-1', '\\\\server\\share\\runs', false],
    ['two-dot name', 'C:\\runs\\..notes', 'C:\\runs', true],
    ['Unicode child', 'C:\\runs\\运行', 'C:\\runs', true],
  ],
};

for (const platform of ['posix', 'win32'] as const) {
  const api = platform === 'posix' ? posix : win32;
  const isPathWithin = runInNewContext(
    `(function(candidatePath, rootPath) {${helper[1]}\n})`,
    { relative: api.relative, isAbsolute: api.isAbsolute, sep: api.sep },
    { timeout: 1000 },
  ) as (candidate: string, root: string) => boolean;

  describe(`runtime home path containment (${platform})`, () => {
    for (const [name, candidate, root, expected] of cases[platform]) {
      it(name, () => {
        assert.equal(isPathWithin(api.resolve(candidate), api.resolve(root)), expected);
      });
    }
  });
}
