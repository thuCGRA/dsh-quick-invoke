import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDshAdapter } from '../src/dsh-adapter.js';

test('adapter exposes only user-invocable skills and read-only plugin inventory', async () => {
  const adapter = createDshAdapter({
    skills: {
      list: async () => [
        { name: 'public', description: 'public', invocation: { userInvocable: true } },
        { name: 'internal', description: 'internal', invocation: { userInvocable: false } }
      ]
    },
    pluginInventory: { list: () => ({ entries: [{ moduleName: 'demo', enabled: true, fiberPhase: 'active' }] }) }
  });
  assert.deepEqual(await adapter.listInvocableSkills(), [{ name: 'public', description: 'public' }]);
  assert.deepEqual(await adapter.listPlugins(), [{ name: 'demo', enabled: true, fiberPhase: 'active' }]);
});

test('skill invocation lists skills from the active Agent workspace and scope', async () => {
  const calls = [];
  const agent = { session: { header: { cwd: '/workspace/project' } } };
  const adapter = createDshAdapter({
    skills: {
      list: async (options) => {
        calls.push(options);
        return [{ name: 'quick-invoke-test', invocation: { userInvocable: false } }];
      }
    }
  });
  assert.deepEqual(await adapter.invokeSkill('quick-invoke-test', '', { agent }), {
    kind: 'error', text: 'Skill is unavailable for user invocation: quick-invoke-test'
  });
  assert.deepEqual(calls, [{ cwd: '/workspace/project', scope: agent }]);
});

test('adapter never provides plugin enable or disable operations', () => {
  const adapter = createDshAdapter({});
  assert.equal('enablePlugin' in adapter, false);
  assert.equal('disablePlugin' in adapter, false);
});

test('adapter switches the selected Agent preset for the active session', async () => {
  const calls = [];
  const agent = { ctx: {} };
  const adapter = createDshAdapter({
    agentPresets: { recompose: async (...args) => calls.push(args) }
  });
  assert.deepEqual(await adapter.invokeAgent('quick-invoke-test', '', { agent }), {
    kind: 'success', text: 'Agent preset selected: quick-invoke-test'
  });
  assert.deepEqual(calls, [[agent.ctx, 'quick-invoke-test']]);
});

test('adapter refuses Agent preset switching without a scoped Agent context', async () => {
  const adapter = createDshAdapter({
    agentPresets: { recompose: async () => { throw new Error('must not be called'); } }
  });
  assert.deepEqual(await adapter.invokeAgent('quick-invoke-test', '', { agent: {} }), {
    kind: 'error',
    text: 'Agent preset switching requires a scoped Agent context'
  });
});
