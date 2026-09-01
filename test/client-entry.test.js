import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { apply, inject } from '../client/index.js';

test('exports a Web client decoration contract', () => {
  assert.deepEqual(inject, ['commandUi', 'connection', 'sessions']);
  assert.equal(typeof apply, 'function');
});

test('decorations use DSH popupSelect for keyboard selection', () => {
  const decorations = [];
  const ctx = {
    commandUi: { decorate(value) { decorations.push(value); return () => {}; } },
    connection: { api: { skills: { list: async () => ({ result: { ok: true, value: { skills: [] } } }) } } },
    sessions: { scope() { return { get() { return undefined; } }; } }
  };
  apply(ctx);
  assert.equal(decorations[0].ui.kind, 'popupSelect');
  assert.equal(typeof decorations[0].ui.options, 'function');
  assert.equal(typeof decorations[0].ui.onSelect, 'function');
});

test('selecting a skill fills the composer and does not execute remotely', async () => {
  const calls = [];
  const decorations = [];
  const emitted = [];
  const ctx = {
    commandUi: { decorate(value) { decorations.push(value); return () => {}; } },
    connection: { api: { skills: { list: async () => ({ result: { ok: true, value: { skills: [{ name: 'quick-invoke-test', description: 'test' }] } } }) }, agentPresets: { list: async () => ({ result: { ok: true, value: { presets: [] } } }) } } },
    remote: { commands: { execute: async (...args) => { calls.push(args); return { ok: true }; } } },
    sessions: { scope() { return {
      get(name) { return name === 'conversation' ? { input: { for: () => ({ state: { getSnapshot: () => ({ draft: '/skill', draftRev: 3 }) } }) } } : undefined; },
      emit(name, request) { emitted.push([name, request]); }
    }; } }
  };
  apply(ctx);
  const options = await decorations[0].ui.options({ sessionId: 's1' }, new AbortController().signal);
  await decorations[0].ui.onSelect(options[0], { sessionId: 's1' });
  assert.deepEqual(calls, []);
  assert.deepEqual(emitted, [['slash/input-insert-text', {
    text: '/skill quick-invoke-test ',
    span: { start: 0, end: 6, draftRev: 3 }
  }]]);
});

test('selection schedules focus back to the active composer without submitting', async () => {
  const decorations = [];
  const emitted = [];
  let focused = 0;
  const previousDocument = globalThis.document;
  const previousQueueMicrotask = globalThis.queueMicrotask;
  globalThis.document = { querySelectorAll: () => [{ disabled: false, focus: () => { focused += 1; } }] };
  globalThis.queueMicrotask = (fn) => fn();
  try {
    const ctx = {
      commandUi: { decorate(value) { decorations.push(value); return () => {}; } },
      connection: { api: { skills: { list: async () => ({ result: { ok: true, value: { skills: [] } } }) }, agentPresets: { list: async () => ({ result: { ok: true, value: { presets: [] } } }) } } },
      sessions: { scope() { return {
        get() { return { input: { for: () => ({ state: { getSnapshot: () => ({ draft: '/skill', draftRev: 1 }) } }) } }; },
        emit(name, request) { emitted.push([name, request]); }
      }; } }
    };
    apply(ctx);
    await decorations[0].ui.onSelect({ id: 'demo' }, { sessionId: 's1' });
  } finally {
    globalThis.document = previousDocument;
    globalThis.queueMicrotask = previousQueueMicrotask;
  }
  assert.equal(focused, 1);
  assert.equal(emitted[0][1].text, '/skill demo ');
});

test('browser client uses ModuleLoader and commandUi.decorate', async () => {
  const source = await readFile(new URL('../client/client.js', import.meta.url), 'utf8');
  assert.match(source, /window\.\__ModuleLoader__\.load\(\{/);
  assert.match(source, /id:\s*["']dsh-quick-invoke["']/);
  assert.match(source, /commandUi\.decorate/);
  assert.match(source, /inject:\s*\[[^\]]*["']commandUi["'][^\]]*["']connection["'][^\]]*["']sessions["']/s);
});

test('package declares service dependencies, not package names', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(packageJson.dsh.client.inject, ['commandUi', 'connection', 'sessions']);
});

test('browser decorations expose skill options from the session API', async () => {
  let plugin;
  const source = await readFile(new URL('../client/client.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load(value) { plugin = value.factory(() => {}); } } } });
  const decorations = [];
  const ctx = {
    get(name) {
      if (name === 'commandUi') return { decorate(value) { decorations.push(value); return () => {}; } };
      if (name === 'connection') return { api: { skills: { list: async () => ({ result: { ok: true, value: { skills: [{ name: 'quick-invoke-test', description: 'test' }] } } }) }, agentPresets: { list: async () => ({ result: { ok: true, value: { presets: [] } } }) } } };
      if (name === 'sessions') return { scope() { return { get() { return undefined; }, emit() {} }; } };
      throw new Error(`unexpected service ${name}`);
    },
    effect(fn) { return fn(); }
  };
  plugin.apply(ctx);
  const options = await decorations[0].ui.options({ sessionId: 's1' }, new AbortController().signal);
  assert.deepEqual(options.map((option) => option.id), ['quick-invoke-test']);
});
