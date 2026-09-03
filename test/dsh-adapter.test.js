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

test('skill invocation validates against the active session skill list', async () => {
  const calls = [];
  const messages = [];
  const agent = {
    session: { id: 'session-test', header: { cwd: '/workspace/project' } },
    followup: (message) => { messages.push(message); }
  };
  const adapter = createDshAdapter({
    skills: {
      list: async (options) => {
        calls.push(options);
        return [{ name: 'quick-invoke-test', invocation: { userInvocable: true } }];
      }
    }
  });
  assert.deepEqual(await adapter.invokeSkill('quick-invoke-test', '验证任务', { agent }), {
    kind: 'success', text: 'Skill queued: quick-invoke-test'
  });
  assert.deepEqual(calls, [{ cwd: '/workspace/project', scope: agent }]);
  assert.equal(messages[0].role, 'user');
  assert.deepEqual(messages[0].content, [{ type: 'text', text: '/quick-invoke-test 验证任务' }]);
  assert.deepEqual(messages[0].source, { kind: 'user' });
});

test('adapter never provides plugin enable or disable operations', () => {
  const adapter = createDshAdapter({});
  assert.equal('enablePlugin' in adapter, false);
  assert.equal('disablePlugin' in adapter, false);
});

test('adapter selects an Agent preset through the official Host API seam', async () => {
  const calls = [];
  const agent = { session: { id: 'session-test' } };
  const adapter = createDshAdapter({
    apiProxy: { agentPresets: { select: async (request) => { calls.push(request); return { result: { ok: true, value: { agentPreset: 'quick-invoke-agent' } } }; } } }
  });
  assert.deepEqual(await adapter.invokeAgent('quick-invoke-agent', '', { agent }), {
    kind: 'success', text: 'Agent preset selected: quick-invoke-agent'
  });
  assert.equal(calls[0].payload.sessionId, 'session-test');
  assert.equal(calls[0].payload.agentPreset, 'quick-invoke-agent');
  assert.equal(typeof calls[0].rpcId, 'string');
});

test('adapter submits the Agent prompt once after a successful preset switch', async () => {
  const messages = [];
  const agent = { session: { id: 'session-test' }, followup: (message) => { messages.push(message); } };
  const adapter = createDshAdapter({
    apiProxy: { agentPresets: { select: async () => ({ result: { ok: true, value: { agentPreset: 'quick-invoke-agent' } } }) } }
  });

  assert.deepEqual(await adapter.invokeAgent('quick-invoke-agent', '分析当前问题', { agent }), {
    kind: 'success', text: 'Agent preset selected: quick-invoke-agent'
  });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, 'user');
  assert.deepEqual(messages[0].content, [{ type: 'text', text: '分析当前问题' }]);
  assert.deepEqual(messages[0].source, { kind: 'user' });
});

test('adapter does not submit an Agent prompt when preset switching fails', async () => {
  const messages = [];
  const agent = { session: { id: 'session-test' }, followup: (message) => { messages.push(message); } };
  const adapter = createDshAdapter({
    apiProxy: { agentPresets: { select: async () => ({ result: { ok: false, error: { code: 'agent-preset-locked', message: 'session already started' } } }) } }
  });

  assert.deepEqual(await adapter.invokeAgent('quick-invoke-agent', '不要发送', { agent }), {
    kind: 'error', text: 'agent-preset-locked: session already started'
  });
  assert.deepEqual(messages, []);
});

test('adapter refuses Agent preset switching when the official seam is unavailable', async () => {
  const adapter = createDshAdapter({
    agentPresets: { recompose: async () => { throw new Error('must not be called'); } }
  });
  assert.deepEqual(await adapter.invokeAgent('quick-invoke-agent', '', { agent: {} }), {
    kind: 'error',
    text: 'Agent preset selection is unavailable: official agentPreset.select is not exposed to this plugin'
  });
});
