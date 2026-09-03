import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { apply, inject, name } from '../src/index.js';

test('exports a DSH plugin entry contract', () => {
  assert.equal(name, 'dsh-quick-invoke');
  assert.deepEqual(inject, ['commands', 'skills', 'agentPresets', 'pluginInventory', 'apiProxy']);
  assert.equal(typeof apply, 'function');
});

test('ships four distinct user-invocable test Skills', async () => {
  const names = ['quick-invoke-test', 'quick-invoke-skill-load', 'quick-invoke-skill-context', 'quick-invoke-skill-error'];
  for (const skillName of names) {
    const source = await readFile(new URL(`../.dsh/skills/${skillName}/SKILL.md`, import.meta.url), 'utf8');
    assert.match(source, new RegExp(`name:\\s*${skillName}`));
    assert.match(source, /user-invocable:\s*true/);
  }
});
