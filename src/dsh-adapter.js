function service(ctx, name) {
  return ctx?.[name];
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
    async listAgentPresets() {
      const presets = service(ctx, 'agentPresets');
      if (!presets || typeof presets.list !== 'function') return [];
      return (await presets.list()).map((entry) => ({
        name: entry.id,
        description: entry.description ?? entry.name ?? entry.id
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
      const entries = skills && typeof skills.list === 'function' ? await skills.list({ scope: agent }) : [];
      const skill = entries.find((entry) => entry.name === name);
      if (!skill || skill.invocation?.userInvocable !== true) {
        return { kind: 'error', text: `Skill is unavailable for user invocation: ${name}` };
      }
      if (!agent || typeof agent.followup !== 'function') {
        return { kind: 'error', text: 'No active agent is available for skill invocation' };
      }
      const { createUserMessage } = await import('@deepseek-ai/dsh-llm');
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: `/${name}${prompt ? ` ${prompt}` : ''}` }],
        source: { kind: 'user' }
      }));
      return { kind: 'success', text: `Skill queued: ${name}` };
    },
    async invokeAgent(name, _prompt, invocation) {
      const presets = service(ctx, 'agentPresets');
      const agent = invocation?.agent;
      if (!presets || typeof presets.recompose !== 'function' || !agent) {
        return { kind: 'error', text: 'Agent preset switching is unavailable in this session' };
      }
      try {
        await presets.recompose(agent, name);
        return { kind: 'success', text: `Agent preset selected: ${name}` };
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) };
      }
    }
  };
}
