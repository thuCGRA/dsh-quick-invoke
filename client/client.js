window.__ModuleLoader__.load({
  id: 'dsh-quick-invoke',
  factory: () => {
    const log = (...args) => globalThis.console?.info?.('[dsh-quick-invoke]', ...args);
    const warn = (...args) => globalThis.console?.warn?.('[dsh-quick-invoke]', ...args);

    const fillComposer = (ctx, command, option, session) => {
      const actx = ctx.get('sessions').scope(session.sessionId);
      const conversation = actx?.get?.('conversation');
      const input = conversation?.input?.for?.(actx);
      const state = input?.state?.getSnapshot?.();
      if (!state || typeof state.draft !== 'string' || typeof state.draftRev !== 'number') {
        throw new Error('dsh-quick-invoke cannot access the session composer');
      }
      const token = `/${command}`;
      const tokenStart = state.draft.lastIndexOf(token);
      actx.emit('slash/input-insert-text', {
        text: `${token} ${option.id} `,
        span: { start: tokenStart >= 0 ? tokenStart : 0, end: state.draft.length, draftRev: state.draftRev }
      });
      log('selection inserted into composer', { command, id: option.id, sessionId: session.sessionId });
    };

    const skillDecoration = (ctx) => ({
      name: 'skill', available: () => true,
      ui: { kind: 'popupSelect', async options(session, signal) {
        try {
          const response = await ctx.get('connection').api.skills.list({ sessionId: session.sessionId }, signal);
          if (!response.result?.ok) { warn('skill.list returned an error', response.result?.error); return []; }
          const items = (response.result.value.skills ?? []).map((skill) => ({ id: skill.name, label: skill.name, detail: skill.description }));
          log('skill candidates', { sessionId: session.sessionId, count: items.length });
          return items;
        } catch (error) { warn('skill.list failed', error); return []; }
      }, onSelect(option, session) { return fillComposer(ctx, 'skill', option, session); } }
    });

    const agentDecoration = (ctx) => ({
      name: 'agent', available: () => true,
      ui: { kind: 'popupSelect', async options() {
        try {
          const response = await ctx.get('connection').api.agentPresets.list({});
          if (!response.result?.ok) { warn('agentPreset.list returned an error', response.result?.error); return []; }
          const items = (response.result.value.presets ?? []).filter((preset) => !preset.broken)
            .map((preset) => ({ id: preset.id, label: preset.id, detail: preset.description }));
          log('agent candidates', { count: items.length });
          return items;
        } catch (error) { warn('agentPreset.list failed', error); return []; }
      }, onSelect(option, session) { return fillComposer(ctx, 'agent', option, session); } }
    });

    const pluginDecoration = (ctx) => ({
      name: 'plugin', available: () => true,
      ui: { kind: 'popupSelect', async options() { return [
        { id: 'list', label: 'list', detail: 'List installed plugins' },
        { id: 'inspect', label: 'inspect', detail: 'Inspect a plugin (append its name manually)' },
        { id: 'open', label: 'open', detail: 'Open a plugin Web UI (append its name manually)' }
      ]; }, onSelect(option, session) { return fillComposer(ctx, 'plugin', option, session); } }
    });

    const apply = (ctx) => {
      const commandUi = ctx.get('commandUi');
      if (!commandUi?.decorate) throw new TypeError('dsh-quick-invoke requires commandUi.decorate');
      const disposers = [commandUi.decorate(skillDecoration(ctx)), commandUi.decorate(agentDecoration(ctx)), commandUi.decorate(pluginDecoration(ctx))];
      log('command decorations registered');
      const cleanup = () => disposers.reverse().forEach((dispose) => dispose?.());
      log('client applied');
      return ctx.effect ? ctx.effect(() => cleanup, 'dsh-quick-invoke command decorations') : cleanup;
    };

    return { apply, inject: ['commandUi', 'connection', 'sessions'] };
  }
});
