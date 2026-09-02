import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSlashSource } from '../client/slash-source.js';

const session = { sessionId: 'session-1' };
const request = (query) => ({ query, position: 'leading', signal: new AbortController().signal });

test('offers the three top-level commands and filters by query', async () => {
  const source = createSlashSource({});
  const all = await source.candidates(session, request(''));
  assert.deepEqual(all.map((candidate) => candidate.name), ['/skill', '/agent', '/plugin']);
  const filtered = await source.candidates(session, request('sk'));
  assert.deepEqual(filtered.map((candidate) => candidate.name), ['/skill']);
});

test('offers dynamic skill and agent candidates after a command prefix', async () => {
  const source = createSlashSource({
    listInvocableSkills: async () => [{ name: 'quick-invoke-test', description: 'test skill' }],
    listAgentPresets: async () => [{ name: 'quick-invoke-agent', description: 'test agent' }]
  });
  assert.deepEqual(
    (await source.candidates(session, request('skill '))).map((candidate) => candidate.name),
    ['quick-invoke-test']
  );
  assert.deepEqual(
    (await source.candidates(session, request('agent q'))).map((candidate) => candidate.name),
    ['quick-invoke-agent']
  );
});

test('picks produce a command claim and preserve the selected command', () => {
  const source = createSlashSource({});
  const outcome = source.onPick({
    candidate: { name: '/skill', value: 'skill' },
    session,
    position: 'leading',
    via: 'menu',
    span: { start: 0, end: 1, draftRev: 1 }
  });
  assert.equal(outcome.claim.token, '/skill ');
  assert.equal(typeof outcome.claim.submit, 'function');
});
