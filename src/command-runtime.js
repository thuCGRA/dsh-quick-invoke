import { parseSlash } from './parser.js';

const COMMANDS = ['skill', 'agent', 'plugin'];

function resultError(text) {
  return { kind: 'error', text };
}

function normalizeInvocation(invocation) {
  if (typeof invocation === 'string') return invocation;
  if (invocation && typeof invocation.rawInput === 'string') return invocation.rawInput;
  return '';
}

function parseInvocation(command, invocation) {
  const parsed = parseSlash(`/${command}${normalizeInvocation(invocation)}`);
  if (!parsed.matched) {
    if (command === 'plugin' && parsed.error?.code === 'UNKNOWN_SUBCOMMAND') {
      const subcommand = normalizeInvocation(invocation).trim().split(/\s+/)[0];
      return resultError(`Unsupported plugin subcommand: ${subcommand}`);
    }
    return resultError(parsed.error?.message ?? `Invalid /${command} invocation`);
  }
  return parsed.command;
}

function invoke(adapter, method, ...args) {
  if (typeof adapter?.[method] !== 'function') {
    return resultError(`Command adapter does not implement ${method}`);
  }
  return adapter[method](...args);
}

function formatPluginInventory(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return 'No installed plugins.';
  const lines = entries.map((entry) => {
    const name = typeof entry?.name === 'string' ? entry.name : String(entry?.moduleName ?? 'unknown');
    const enabled = entry?.enabled === true ? 'enabled' : 'disabled';
    const phase = typeof entry?.fiberPhase === 'string' && entry.fiberPhase.length > 0
      ? `, ${entry.fiberPhase}`
      : '';
    return `- ${name} [${enabled}${phase}]`;
  });
  return `Installed plugins:\n${lines.join('\n')}`;
}

/** Register the Host-side commands and return their disposers. */
export function registerCommands(ctx, adapter = {}) {
  if (!ctx?.commands || typeof ctx.commands.register !== 'function') {
    throw new TypeError('dsh-quick-invoke requires commands.register');
  }

  const definitions = [
    {
      name: 'skill',
      description: 'Invoke a user-invocable skill',
      input: { hint: '<name> [prompt]' },
      handler(invocation) {
        const command = parseInvocation('skill', invocation);
        if (command.kind === 'error') return command;
        return invoke(adapter, 'invokeSkill', command.name, command.prompt ?? '', invocation);
      }
    },
    {
      name: 'agent',
      description: 'Invoke an agent preset',
      input: { hint: '<name> [prompt]' },
      handler(invocation) {
        const command = parseInvocation('agent', invocation);
        if (command.kind === 'error') return command;
        return invoke(adapter, 'invokeAgent', command.name, command.prompt ?? '', invocation);
      }
    },
    {
      name: 'plugin',
      description: 'List, inspect, or open installed plugins',
      input: { hint: 'list | inspect <name> | open <name>' },
      handler(invocation) {
        const command = parseInvocation('plugin', invocation);
        if (command.kind === 'error') return command;
        if (command.subcommand === 'list') {
          return Promise.resolve(invoke(adapter, 'listPlugins')).then((entries) => {
            if (entries?.kind === 'error') return entries;
            return { kind: 'success', text: formatPluginInventory(entries) };
          });
        }
        if (command.subcommand === 'inspect') return invoke(adapter, 'inspectPlugin', command.name);
        if (command.subcommand === 'open') return invoke(adapter, 'openPlugin', command.name);
        return resultError(`Unsupported plugin subcommand: ${command.subcommand}`);
      }
    }
  ];

  const disposers = definitions.map((definition) => ctx.commands.register(definition));
  return () => {
    for (const dispose of disposers.reverse()) {
      if (typeof dispose === 'function') dispose();
    }
  };
}

export { COMMANDS };
