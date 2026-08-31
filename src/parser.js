const COMMANDS = new Set(['skill', 'agent', 'plugin']);
const PLUGIN_COMMANDS = new Set(['list', 'inspect', 'open']);
const NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function error(code, message) {
  return { matched: false, error: { code, message } };
}

function ordinary() {
  return { matched: false };
}

function parseTarget(rawInput, kind, name, prompt) {
  if (!name) return error('MISSING_NAME', `/${kind} requires a name`);
  if (!NAME_PATTERN.test(name)) return error('INVALID_NAME', `invalid ${kind} name`);
  return {
    matched: true,
    command: {
      kind,
      name,
      ...(prompt ? { prompt } : {}),
      rawInput
    }
  };
}

/** Parse one leading slash invocation. */
export function parseSlash(input) {
  if (typeof input !== 'string') return error('INVALID_INPUT', 'input must be a string');

  const trimmed = input.trimStart();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('\\/')) {
    return ordinary();
  }
  if (trimmed.startsWith('```') || (trimmed.startsWith('`') && trimmed.endsWith('`'))) {
    return ordinary();
  }

  const match = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(trimmed);
  if (!match) return error('INVALID_SYNTAX', 'invalid slash command syntax');

  const [, commandName, remainder = ''] = match;
  if (!COMMANDS.has(commandName)) return error('UNKNOWN_COMMAND', `unknown slash command: ${commandName}`);

  const parts = remainder.trim().split(/\s+/).filter(Boolean);
  if (commandName === 'skill' || commandName === 'agent') {
    const [name, ...promptParts] = parts;
    return parseTarget(input, commandName, name, promptParts.join(' '));
  }

  const [subcommand, name, ...extra] = parts;
  if (!subcommand) return error('MISSING_SUBCOMMAND', '/plugin requires a subcommand');
  if (!PLUGIN_COMMANDS.has(subcommand)) return error('UNKNOWN_SUBCOMMAND', `unknown plugin subcommand: ${subcommand}`);
  if (subcommand === 'list') {
    if (name || extra.length) return error('UNEXPECTED_ARGUMENT', '/plugin list accepts no plugin name');
    return { matched: true, command: { kind: 'plugin', subcommand, rawInput: input } };
  }
  if (!name || extra.length) return error('MISSING_NAME', `/plugin ${subcommand} requires one plugin name`);
  if (!NAME_PATTERN.test(name)) return error('INVALID_NAME', 'invalid plugin name');
  return { matched: true, command: { kind: 'plugin', subcommand, name, rawInput: input } };
}
