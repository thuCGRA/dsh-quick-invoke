import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerCommands } from '../src/command-runtime.js';

function fakeContext() {
  const definitions = [];
  return {
    commands: {
      register(definition) {
        definitions.push(definition);
        return () => definitions.splice(definitions.indexOf(definition), 1);
      }
    },
    definitions
  };
}

test('registers only the three supported Host commands', () => {
  const ctx = fakeContext();
  const adapter = {};
  registerCommands(ctx, adapter);
  assert.deepEqual(ctx.definitions.map((definition) => definition.name), ['skill', 'agent', 'plugin']);
  assert.equal(ctx.definitions.some((definition) => definition.name === 'tool'), false);
  assert.deepEqual(ctx.definitions.map((definition) => definition.input), [
    { hint: '<name> [prompt]' },
    { hint: '<name> [prompt]' },
    { hint: 'list | inspect <name> | open <name>' }
  ]);
});

test('skill command delegates the parsed name and prompt', async () => {
  const ctx = fakeContext();
  const calls = [];
  registerCommands(ctx, {
    invokeSkill: async (name, prompt) => {
      calls.push({ name, prompt });
      return { kind: 'success', text: 'skill invoked' };
    }
  });
  const result = await ctx.definitions[0].handler({ rawInput: ' quick-invoke-test 验证命令' });
  assert.deepEqual(calls, [{ name: 'quick-invoke-test', prompt: '验证命令' }]);
  assert.deepEqual(result, { kind: 'success', text: 'skill invoked' });
});

test('plugin command accepts only list, inspect, and open', async () => {
  const ctx = fakeContext();
  registerCommands(ctx, {
    listPlugins: async () => ({ kind: 'success', text: 'plugins' }),
    inspectPlugin: async (name) => ({ kind: 'success', text: `inspect:${name}` }),
    openPlugin: async (name) => ({ kind: 'success', text: `open:${name}` })
  });
  const plugin = ctx.definitions[2];
  assert.deepEqual(await plugin.handler({ rawInput: ' list' }), { kind: 'success', text: 'No installed plugins.' });
  assert.deepEqual(await plugin.handler({ rawInput: ' inspect demo' }), { kind: 'success', text: 'inspect:demo' });
  assert.deepEqual(await plugin.handler({ rawInput: ' enable demo' }), { kind: 'error', text: 'Unsupported plugin subcommand: enable' });
});

test('plugin list returns the installed inventory through the Host command', async () => {
  const ctx = fakeContext();
  const inventory = [{ name: 'dsh-quick-invoke', enabled: true, fiberPhase: 'active' }];
  registerCommands(ctx, { listPlugins: async () => inventory });

  const result = await ctx.definitions[2].handler({
    rawInput: ' list',
    agent: { session: { id: 'session-test' } }
  });

  assert.deepEqual(result, {
    kind: 'success',
    text: 'Installed plugins:\n- dsh-quick-invoke [enabled, active]'
  });
});
