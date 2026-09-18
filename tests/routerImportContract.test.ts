import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return collectSourceFiles(path);
    return /\.(?:ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('router import contract', () => {
  test('uses the declared react-router-dom dependency for all router contexts', () => {
    const sourceDirectory = join(import.meta.dir, '../src');
    const directImports = collectSourceFiles(sourceDirectory).filter((path) =>
      /from\s+['"]react-router['"]/.test(readFileSync(path, 'utf8'))
    );

    expect(directImports).toEqual([]);
  });
});
