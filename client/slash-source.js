const TOP_LEVEL = [
  { name: '/skill', value: 'skill', description: 'Invoke a user-invocable skill' },
  { name: '/agent', value: 'agent', description: 'Invoke an agent preset' },
  { name: '/plugin', value: 'plugin', description: 'List, inspect, or open a plugin' }
];
const PLUGIN_SUBCOMMANDS = [
  { name: 'list', value: 'plugin list', description: 'List installed plugins' },
  { name: 'inspect', value: 'plugin inspect', description: 'Inspect a plugin' },
  { name: 'open', value: 'plugin open', description: 'Open a plugin Web UI' }
];

function filter(items, query) {
  const normalized = query.trim().replace(/^\//, '').toLowerCase();
  if (!normalized) return items;
  return items.filter((item) => item.name.replace(/^\//, '').toLowerCase().startsWith(normalized));
}

async function dynamicCandidates(adapter, kind, query) {
  const method = kind === 'skill' ? 'listInvocableSkills' : 'listAgentPresets';
  if (typeof adapter?.[method] !== 'function') return [];
  const items = await adapter[method]();
  return filter(items.map((item) => ({
    name: item.name,
    description: item.description,
    value: `${kind} ${item.name}`
  })), query);
}

/** Build the slash input source; all host actions are deferred to submit(). */
export function createSlashSource(adapter = {}) {
  return {
    trigger: '/',
    name: 'quick-invoke',
    order: -10,
    candidates: async (_session, req) => {
      const query = req.query ?? '';
      if (query === '' || !query.includes(' ')) return filter(TOP_LEVEL, query);
      const [kind, ...rest] = query.trimStart().split(/\s+/);
      const argument = rest.join(' ');
      if (kind === 'skill' || kind === 'agent') return dynamicCandidates(adapter, kind, argument);
      if (kind === 'plugin') {
        if (!rest.length) return PLUGIN_SUBCOMMANDS;
        const [subcommand, ...subArgs] = rest;
        if (subcommand === 'inspect' || subcommand === 'open') {
          if (subArgs.length === 0 && typeof adapter.listPlugins === 'function') {
            const plugins = await adapter.listPlugins();
            return filter(plugins.map((item) => ({ name: item.name, description: item.description, value: `plugin ${subcommand} ${item.name}` })), '');
          }
        }
        return [];
      }
      return [];
    },
    onPick: (pick) => {
      const value = pick.candidate.value ?? pick.candidate.name.replace(/^\//, '');
      const token = value.endsWith('list') ? `/${value} ` : `/${value} `;
      return {
        claim: {
          token,
          submit: async (args) => {
            if (typeof adapter.submit !== 'function') return { kind: 'error', text: 'Command adapter does not implement submit' };
            return adapter.submit(`${value}${args ? ` ${args}` : ''}`, pick.session);
          }
        }
      };
    }
  };
}
