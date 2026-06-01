import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { enumerateContractFiles } from '../compile/contract-images';

// Regression for the `reactor doctor` hang found by Wave-0 stranger validation:
// the contract walk used `stat` (follows symlinks) with no cycle guard, so a walk
// rooted at/above a symlink cycle (a container's /proc/<pid>/root -> /) recursed
// forever and pegged a CPU. The walk must terminate from anywhere and never follow
// a symlink.
test('enumerateContractFiles terminates on a symlink cycle and finds only real contracts', () => {
  const root = mkdtempSync(join(tmpdir(), 'reactor-cli-walk-'));
  try {
    writeFileSync(join(root, 'inbox.prose.md'), '---\nname: inbox\n---\n');
    const sub = join(root, 'nested');
    mkdirSync(sub);
    writeFileSync(join(sub, 'digest.prose.md'), '---\nname: digest\n---\n');
    // A cycle: nested/loop -> root. The old (stat-following) walk would recurse forever.
    symlinkSync(root, join(sub, 'loop'));

    const found = enumerateContractFiles(root); // must not hang
    assert.equal(found.length, 2, 'finds exactly the two real contracts, not via the cycle');
    assert.ok(found.some((p) => p.endsWith('inbox.prose.md')));
    assert.ok(found.some((p) => p.endsWith('digest.prose.md')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
