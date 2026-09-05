import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import remote from '../client/project-agent-presets-remote.js';
import { TYPERT } from '../src/project-agent-presets-remote.js';
import { discoverProjectAgentPresets } from '../src/project-agent-presets.js';

test('project Agent Remote is a session-scoped read-only list endpoint', async () => {
  assert.equal(remote.package, 'dsh-quick-invoke');
  const descriptor = remote.descriptors[0];
  assert.equal(descriptor.service, 'projectAgentPresets');
  assert.equal(descriptor.method, 'list');
  assert.deepEqual(descriptor.scope, { context: 'agent', wire: 'agentId' });
  assert.equal(descriptor.parameters[0].source, 'lookup');
  assert.equal(descriptor.parameters[0].lookup, 'agent');
  assert.equal(descriptor.parameters[0].wire, 'agentId');
});

test('Host Remote implementation delegates discovery to the session cwd', async () => {
  const source = await readFile(new URL('../src/project-agent-presets-remote.js', import.meta.url), 'utf8');
  assert.match(source, /registerProjectAgentPresetsRemote/);
  assert.match(source, /agent\?\.session\?\.header\?\.cwd/);
  assert.match(source, /discoverProjectAgentPresets\(cwd\)/);
  assert.match(source, /Remote\('list'\)/);
});

test('exports a strict Host Typert manifest for automatic loader registration', async () => {
  assert.equal(TYPERT.package, 'dsh-quick-invoke');
  assert.equal(TYPERT.face, 'host');
  assert.equal(TYPERT.invocations[0].id, 'dsh-quick-invoke#projectAgentPresets/list');
  assert.equal(TYPERT.invocations[0].scope.context, 'agent');
  assert.equal(TYPERT.invocations[0].parameters[0].source, 'lookup');
  assert.equal(TYPERT.invocations[0].result.mode, 'strict');
  assert.equal(typeof TYPERT.invocations[0].result.schema.parse, 'function');
  assert.equal(TYPERT.model.services[0].key, 'projectAgentPresets');
});

test('project discovery results satisfy the strict Remote candidate schema', async () => {
  const candidate = (await discoverProjectAgentPresets(new URL('../.dsh/', import.meta.url).pathname))
    .find((entry) => entry.id === 'quick-invoke-project-agent');
  assert.ok(candidate);
  const parsed = TYPERT.invocations[0].result.schema.parse({ candidates: [candidate] });
  assert.equal(parsed.candidates[0].selectionKey, 'project:quick-invoke-project-agent');
  assert.equal(parsed.candidates[0].broken, false);
});
