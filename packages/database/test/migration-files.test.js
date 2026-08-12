import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listMigrations, scaffoldMigration } from '../src/runner.js';

const dirs = [];

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'df-migrations-'));
  dirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('listMigrations', () => {
  let dir;

  beforeEach(() => {
    dir = tempDir();
    for (const name of [
      '0003_projects.js',
      '0001_identity.js',
      '0002_organizations.js',
    ]) {
      writeFileSync(
        join(dir, name),
        'export const up = async () => {};\nexport const down = async () => {};\n',
      );
    }
  });

  it('orders migrations by numeric prefix', () => {
    const migrations = listMigrations(dir);
    expect(migrations.map((m) => m.name)).toEqual([
      '0001_identity',
      '0002_organizations',
      '0003_projects',
    ]);
  });

  it('ignores non-migration files', () => {
    writeFileSync(join(dir, 'README.txt'), 'ignore me');
    expect(listMigrations(dir)).toHaveLength(3);
  });

  it('throws on malformed migration filenames', () => {
    writeFileSync(join(dir, 'helper.js'), 'export const x = 1;');
    expect(() => listMigrations(dir)).toThrow(/invalid migration filename/);
  });

  it('throws on duplicate migration numbers', () => {
    writeFileSync(join(dir, '0002_projects.js'), '');
    expect(() => listMigrations(dir)).toThrow(/duplicate migration number/);
  });
});

describe('scaffoldMigration', () => {
  it('creates a migration with the next numeric prefix', () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, '0001_identity.js'),
      'export const up = async () => {};\nexport const down = async () => {};\n',
    );
    const filename = scaffoldMigration(dir, 'add tasks table');
    expect(filename).toBe('0002_add_tasks_table.js');
    const content = readFileSync(join(dir, filename), 'utf8');
    expect(content).toContain('export const up');
    expect(content).toContain('export const down');
  });

  it('starts at 0001 for an empty directory', () => {
    const dir = tempDir();
    expect(scaffoldMigration(dir, 'bootstrap')).toBe('0001_bootstrap.js');
  });

  it('rejects empty or invalid names', () => {
    const dir = tempDir();
    expect(() => scaffoldMigration(dir, '   ')).toThrow(/non-empty/);
    expect(() => scaffoldMigration(dir, '!@#$')).toThrow(/non-empty/);
  });

  it('sequences repeated names under incrementing numbers', () => {
    const dir = tempDir();
    expect(scaffoldMigration(dir, 'first')).toBe('0001_first.js');
    expect(scaffoldMigration(dir, 'first')).toBe('0002_first.js');
  });
});
