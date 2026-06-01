import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildProgram, main } from '../cli';
import { cliVersion } from '../meta';

describe('cli arg parsing', () => {
  it('builds a program named "reactor"', () => {
    const program = buildProgram();
    assert.equal(program.name(), 'reactor');
  });

  it('registers the doctor subcommand', () => {
    const program = buildProgram();
    const names = program.commands.map((c) => c.name());
    assert.ok(names.includes('doctor'), `expected "doctor" in ${names.join(',')}`);
  });

  it('exposes --version matching package.json', () => {
    const program = buildProgram();
    assert.equal(program.version(), cliVersion());
  });

  it('renders --help text including the doctor command', () => {
    const program = buildProgram();
    program.exitOverride();
    program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    const help = program.helpInformation();
    assert.match(help, /reactor/);
    assert.match(help, /doctor/);
  });

  it('--version throws the commander version signal (handled, not a crash)', () => {
    const program = buildProgram();
    program.exitOverride();
    program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    assert.throws(
      () => program.parse(['node', 'reactor', '--version']),
      (err: unknown) =>
        (err as { code?: string }).code === 'commander.version',
    );
  });

  it('unknown command throws the commander unknown-command signal', () => {
    const program = buildProgram();
    program.exitOverride();
    program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
    assert.throws(
      () => program.parse(['node', 'reactor', 'definitely-not-a-command']),
      (err: unknown) => {
        const code = (err as { code?: string }).code;
        return code === 'commander.unknownCommand' || code === 'commander.help';
      },
    );
  });
});

describe('main() honors the documented exit codes', () => {
  // Silence commander's stderr/stdout for the parse-error + help/version paths.
  const hush = () => {
    const out = process.stdout.write.bind(process.stdout);
    const err = process.stderr.write.bind(process.stderr);
    (process.stdout.write as unknown) = () => true;
    (process.stderr.write as unknown) = () => true;
    return () => {
      (process.stdout.write as unknown) = out;
      (process.stderr.write as unknown) = err;
    };
  };

  it('a help display exits 0', async () => {
    const restore = hush();
    try {
      assert.equal(await main(['node', 'reactor', '--help']), 0);
      assert.equal(await main(['node', 'reactor', 'doctor', '--help']), 0);
    } finally {
      restore();
    }
  });

  it('a version display exits 0', async () => {
    const restore = hush();
    try {
      assert.equal(await main(['node', 'reactor', '--version']), 0);
    } finally {
      restore();
    }
  });

  it('an unknown command is a usage error (exit 2)', async () => {
    const restore = hush();
    try {
      assert.equal(await main(['node', 'reactor', 'definitely-not-a-command']), 2);
    } finally {
      restore();
    }
  });

  it('an unknown global flag is a usage error (exit 2)', async () => {
    const restore = hush();
    try {
      assert.equal(await main(['node', 'reactor', '--definitely-not-a-flag']), 2);
    } finally {
      restore();
    }
  });

  it('an unknown flag on a subcommand is a usage error (exit 2)', async () => {
    const restore = hush();
    try {
      assert.equal(await main(['node', 'reactor', 'status', '--definitely-not-a-flag']), 2);
    } finally {
      restore();
    }
  });

  it('a missing required argument is a usage error (exit 2)', async () => {
    const restore = hush();
    try {
      // `trigger <node>` requires a node argument.
      assert.equal(await main(['node', 'reactor', 'trigger']), 2);
    } finally {
      restore();
    }
  });
});
