import { discoverProjectAgentPresets, mergeAgentPresetCandidates } from './project-agent-presets.js';

function service(ctx, name) {
  return ctx?.[name];
}

function submitUserFollowup(agent, text) {
  agent.followup({
    id: globalThis.crypto.randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' }
  });
}

/** Adapt the installed DSH services to the plugin's small, testable contract. */
export function createDshAdapter(ctx) {
  return {
    async listInvocableSkills() {
      const skills = service(ctx, 'skills');
      if (!skills || typeof skills.list !== 'function') return [];
      const entries = await skills.list();
      return entries
        .filter((entry) => entry.invocation?.userInvocable === true)
        .map(({ name, description }) => ({ name, description }));
    },
    async listAgentPresets(options = {}) {
      const presets = service(ctx, 'agentPresets');
      const cwd = options.cwd ?? options.agent?.session?.header?.cwd;
      const installed = presets && typeof presets.list === 'function'
        ? (await presets.list()).map((entry) => ({
          name: entry.id ?? entry.name,
          description: entry.description ?? entry.name ?? entry.id,
          source: entry.trust === 'user' ? 'user' : 'system',
          status: entry.broken ? 'broken' : 'available'
        }))
        : [];
      const project = typeof cwd === 'string' ? await discoverProjectAgentPresets(cwd, options) : [];
      return mergeAgentPresetCandidates(project, installed.map((entry) => ({
        id: entry.name,
        label: entry.name,
        description: entry.description,
        source: entry.source,
        status: entry.status,
        revision: entry.revision
      }))).map((entry) => ({
        ...entry,
        ...(entry.source === 'project'
          ? { path: project.find((candidate) => candidate.id === entry.id)?.presetPath }
          : {})
      }));
    },
    async listPlugins() {
      const inventory = service(ctx, 'pluginInventory');
      if (!inventory || typeof inventory.list !== 'function') return [];
      return (inventory.list().entries ?? []).map(({ moduleName: name, enabled, fiberPhase }) => ({ name, enabled, fiberPhase }));
    },
    async inspectPlugin(name) {
      const plugin = (await this.listPlugins()).find((entry) => entry.name === name);
      return plugin
        ? { kind: 'success', text: JSON.stringify(plugin) }
        : { kind: 'error', text: `Plugin not found: ${name}` };
    },
    async openPlugin(name) {
      return { kind: 'error', text: `Plugin has no supported Web UI opener: ${name}` };
    },
    async invokeSkill(name, prompt, invocation) {
      const agent = invocation?.agent;
      const skills = service(ctx, 'skills');
      const cwd = agent?.session?.header?.cwd;
      const entries = skills && typeof skills.list === 'function'
        ? await skills.list({ ...(typeof cwd === 'string' ? { cwd } : {}), scope: agent })
        : [];
      const skill = entries.find((entry) => entry.name === name);
      if (!skill || skill.invocation?.userInvocable !== true) {
        return { kind: 'error', text: `Skill is unavailable for user invocation: ${name}` };
      }
      if (!agent || typeof agent.followup !== 'function') {
        return { kind: 'error', text: 'No active agent is available for skill invocation' };
      }
      agent.followup({
        id: globalThis.crypto.randomUUID(),
        role: 'user',
        content: [{ type: 'text', text: `/${name}${prompt ? ` ${prompt}` : ''}` }],
        source: { kind: 'user' }
      });
      return { kind: 'success', text: `Skill queued: ${name}` };
    },
    async invokeAgent(name, _prompt, invocation) {
      const apiProxy = service(ctx, 'apiProxy');
      const agent = invocation?.agent;
      const sessionId = invocation?.sessionId ?? agent?.session?.id;
      if (!apiProxy?.agentPresets || typeof apiProxy.agentPresets.select !== 'function') {
        return { kind: 'error', text: 'Agent preset selection is unavailable: official agentPreset.select is not exposed to this plugin' };
      }
      if (typeof sessionId !== 'string' || sessionId.length === 0) {
        return { kind: 'error', text: 'Agent preset selection requires a session id' };
      }
      try {
        const response = await apiProxy.agentPresets.select({
          rpcId: globalThis.crypto.randomUUID(),
          payload: { sessionId, agentPreset: name }
        });
        if (!response?.result?.ok) {
          const error = response?.result?.error;
          return { kind: 'error', text: error ? `${error.code}: ${error.message}` : 'Agent preset selection failed' };
        }
        if (typeof _prompt === 'string' && _prompt.length > 0) submitUserFollowup(agent, _prompt);
        return { kind: 'success', text: `Agent preset selected: ${name}` };
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) };
      }
    }
  };
}
