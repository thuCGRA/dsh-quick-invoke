import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadBrowserPlugin({ projectPresets = [], projectRemoteError = false, projectRemoteWrapped = false } = {}) {
  const source = await readFile(new URL('../client/client.js', import.meta.url), 'utf8');
  let plugin;
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(bundle) { plugin = bundle.factory(() => {}); } } } });
  const decorations = [];
  const calls = [];
  const emitted = [];
  const projectRemoteArgs = [];
  const context = {
    get(name) {
      if (name === 'commandUi') return { decorate(value) { decorations.push(value); return () => {}; } };
      if (name === 'sessions') return { scope() { return {
        get(name) { return name === 'conversation' ? { input: { for: () => ({ state: { getSnapshot: () => ({ draft: '/skill', draftRev: 1 }) } }) } } : undefined; },
        emit(name, request) { emitted.push([name, request]); }
      }; } };
      if (name === 'connection') return { api: {
        skills: { list: async () => ({ result: { ok: true, value: { skills: [{ name: 'quick-invoke-test', description: 'test' }] } } }) },
        agentPresets: { list: async () => ({ result: { ok: true, value: { presets: [{ id: 'quick-invoke-agent', description: 'test' }] } } }) }
      } };
      if (name === 'remote') return {
        $mount() {},
        projectAgentPresets: { list: async () => {
          if (projectRemoteError) throw new Error('project remote unavailable');
          const value = { candidates: projectPresets };
          return projectRemoteWrapped ? { result: { ok: true, value } } : { ok: true, value };
        } }
      };
      if (name === 'remote.projectAgentPresets') return {
        list: async (...args) => {
          projectRemoteArgs.push(args);
          if (projectRemoteError) throw new Error('project remote unavailable');
          const value = { candidates: projectPresets };
          return projectRemoteWrapped ? { result: { ok: true, value } } : { ok: true, value };
        }
      };
      throw new Error(`unexpected service ${name}`);
    },
    effect(fn) { return fn(); }
  };
  await plugin.apply(context);
  return { decorations, calls, emitted, projectRemoteArgs };
}

test('Web Agent keeps the mounted Remote without resolving it from a later callback context', async () => {
  const source = await readFile(new URL('../client/client.js', import.meta.url), 'utf8');
  let plugin;
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(bundle) { plugin = bundle.factory(() => {}); } } } });
  const decorations = [];
  let remoteReads = 0;
  const remote = { $mount() {} };
  const ctx = {
    get(name) {
      if (name === 'commandUi') return { decorate(value) { decorations.push(value); return () => {}; } };
      if (name === 'connection') return { api: { skills: { list: async () => ({ result: { ok: true, value: { skills: [] } } }) }, agentPresets: { list: async () => ({ result: { ok: true, value: { presets: [] } } }) } } };
      if (name === 'sessions') return { scope() { return { get() { return undefined; }, emit() {} }; } };
      if (name === 'remote') { remoteReads += 1; return remote; }
      if (name === 'remote.projectAgentPresets') return { list: async () => ({ ok: true, value: { candidates: [] } }) };
      throw new Error(`unexpected service ${name}`);
    },
    effect(fn) { return fn(); }
  };
  await plugin.apply(ctx);
  assert.equal((await decorations[1].ui.options({ sessionId: 's1' })).length, 0);
  assert.equal(remoteReads, 1);
});

test('Web command decorations discover Skill, Agent, and Plugin options', async () => {
  const { decorations } = await loadBrowserPlugin();
  assert.deepEqual(await decorations[0].ui.options({ sessionId: 's1' }, new AbortController().signal).then((x) => Array.from(x, (v) => v.id)), ['quick-invoke-test']);
  assert.deepEqual(await decorations[1].ui.options({ sessionId: 's1' }, new AbortController().signal).then((x) => Array.from(x, (v) => v.id)), ['quick-invoke-agent']);
  assert.deepEqual(await decorations[2].ui.options({ sessionId: 's1' }, new AbortController().signal).then((x) => Array.from(x, (v) => v.id)), ['list', 'inspect', 'open']);
});

test('Web command decorations fill the composer for manual sending', async () => {
  const { decorations, calls, emitted } = await loadBrowserPlugin();
  const session = { sessionId: 's1' };
  await decorations[0].ui.onSelect({ id: 'quick-invoke-test' }, session);
  await decorations[1].ui.onSelect({ id: 'quick-invoke-agent' }, session);
  await decorations[2].ui.onSelect({ id: 'list' }, session);
  assert.deepEqual(calls, []);
  assert.deepEqual(emitted.map(([name, request]) => [name, request.text]), [
    ['slash/input-insert-text', '/skill quick-invoke-test '],
    ['slash/input-insert-text', '/agent quick-invoke-agent '],
    ['slash/input-insert-text', '/plugin list ']
  ]);
});

test('Web Agent selection follows the same keyboard popup and composer flow', async () => {
  const { decorations, calls, emitted } = await loadBrowserPlugin();
  assert.equal(decorations[1].ui.kind, 'popupSelect');
  await decorations[1].ui.onSelect({ id: 'quick-invoke-agent' }, { sessionId: 's1' });
  assert.deepEqual(calls, []);
  assert.equal(emitted.at(-1)[1].text, '/agent quick-invoke-agent ');
});

test('Web Agent options include project discovery from the session-scoped Remote', async () => {
  const { decorations, projectRemoteArgs } = await loadBrowserPlugin({ projectPresets: [{
    id: 'quick-invoke-project-agent',
    label: 'quick-invoke-project-agent',
    description: 'project test',
    source: 'project',
    status: 'unregistered',
    selectable: false,
    broken: false,
    ambiguous: false
  }] });
  const options = await decorations[1].ui.options({ sessionId: 's1' });
  assert.deepEqual(Array.from(options, ({ id }) => id), ['quick-invoke-agent', 'quick-invoke-project-agent']);
  assert.equal(options[1].disabled, true);
  assert.equal(options[1].detail, 'project test · unregistered');
  assert.deepEqual(projectRemoteArgs, [['s1']]);
});

test('Web Agent uses the official empty agentPreset.list payload', async () => {
  const { decorations } = await loadBrowserPlugin();
  const options = await decorations[1].ui.options({ sessionId: 's1' });
  assert.deepEqual(Array.from(options, ({ id }) => id), ['quick-invoke-agent']);
});

test('Web Agent keeps official candidates when project discovery fails', async () => {
  const { decorations } = await loadBrowserPlugin({ projectRemoteError: true });
  const options = await decorations[1].ui.options({ sessionId: 's1' });
  assert.deepEqual(Array.from(options, ({ id }) => id), ['quick-invoke-agent']);
});

test('Web Agent accepts both direct and wrapped Remote responses', async () => {
  const { decorations } = await loadBrowserPlugin({ projectRemoteWrapped: true, projectPresets: [{
    id: 'wrapped-project-agent', label: 'Wrapped project agent', source: 'project',
    status: 'unregistered', selectable: false, broken: false, ambiguous: false
  }] });
  const original = decorations[1].ui.options;
  const options = await original({ sessionId: 's1' });
  assert.equal(options.at(-1).id, 'wrapped-project-agent');
});
