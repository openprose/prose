import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildProgram } from '../cli';
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
