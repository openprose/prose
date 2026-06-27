import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { enumerateContractFiles, sliceContract } from '../compile/contract-images';
import { contractSetFingerprint } from '../compile/ir-cache';

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

test('contract images preserve Context and Context edits move the set fingerprint', () => {
  const source = `---
name: context-grounded-summary
kind: responsibility
---

### Requires
- source signal

### Context
- style guide A

### Maintains
- summary
`;
  const changed = source.replace('style guide A', 'style guide B');

  const a = sliceContract(source, '/x/context-grounded-summary.prose.md');
  const b = sliceContract(changed, '/x/context-grounded-summary.prose.md');

  assert.equal(a.context, '- style guide A');
  assert.equal(b.context, '- style guide B');
  assert.notEqual(contractSetFingerprint([a]), contractSetFingerprint([b]));
});

test('contract images read recognized Contract Markdown sections case-insensitively', () => {
  const source = `---
name: mixed-case
kind: responsibility
---

### context
- lowercase context

### MAINTAINS
- uppercase maintains
`;

  const image = sliceContract(source, '/x/mixed-case.prose.md');

  assert.equal(image.context, '- lowercase context');
  assert.equal(image.maintains, '- uppercase maintains');
});
