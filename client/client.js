window.__ModuleLoader__.load({
  id: 'dsh-quick-invoke',
  factory: () => {
    const projectAgentPresetsRemote = {
      package: 'dsh-quick-invoke',
      descriptors: [{
        id: 'dsh-quick-invoke#projectAgentPresets/list',
        service: 'projectAgentPresets',
        namespace: 'projectAgentPresets',
        method: 'list',
        invocation: { kind: 'direct' },
        scope: { context: 'agent', wire: 'agentId' },
        parameters: [{
          name: 'agent', wire: 'agentId', source: 'lookup', lookup: 'agent',
          codec: { mode: 'strict', typeSymbol: '@deepseek-ai/dsh-session/types#SessionId', schema: {
            parse(value) { if (typeof value !== 'string') throw new TypeError('expected session id'); return value; }
          } }
        }],
        result: { mode: 'strict', typeSymbol: 'dsh-quick-invoke#ProjectAgentPresetSnapshot', schema: {
          parse(value) { if (!value || !Array.isArray(value.candidates)) throw new TypeError('invalid project preset result'); return value; }
        } }
      }]
    };
    const log = (...args) => globalThis.console?.info?.('[dsh-quick-invoke]', ...args);
    const warn = (...args) => globalThis.console?.warn?.('[dsh-quick-invoke]', ...args);

    // DSH's popup controller exposes a composer-focus hook internally, but
    // older Web builds do not bind that hook from InputBar. Return focus to
    // the rendered composer after selection; this only enables continued
    // typing and intentionally does not submit the message.
    const focusComposerAfterSelection = () => {
      const documentRef = globalThis.document;
      if (!documentRef?.querySelectorAll) return;
      const textareas = documentRef.querySelectorAll('[data-composer-card] textarea');
      const textarea = Array.from(textareas).find((element) => !element.disabled);
      if (!textarea || typeof textarea.focus !== 'function') return;
      const focus = () => textarea.focus({ preventScroll: true });
      if (typeof globalThis.queueMicrotask === 'function') globalThis.queueMicrotask(focus);
      else globalThis.setTimeout?.(focus, 0);
    };

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
      focusComposerAfterSelection();
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
      ui: { kind: 'popupSelect', async options(session, signal) {
        try {
          const response = await ctx.get('connection').api.agentPresets.list({}, signal);
          if (!response.result?.ok) { warn('agentPreset.list returned an error', response.result?.error); return []; }
          const official = (response.result.value.presets ?? []).filter((preset) => !preset.broken)
            .map((preset) => ({ id: preset.id, label: preset.id, detail: preset.description, disabled: false }));
          const remote = ctx.get('remote');
          const projectResponse = remote?.projectAgentPresets?.list
            ? await remote.projectAgentPresets.list(session?.sessionId, signal)
            : { ok: true, value: { candidates: [] } };
          const project = projectResponse?.ok
            ? (projectResponse.value?.candidates ?? []).map((preset) => ({
              id: preset.id,
              label: preset.label ?? preset.id,
              detail: [preset.description, preset.status].filter(Boolean).join(' · '),
              disabled: preset.selectable !== true
            }))
            : [];
          const items = [...official, ...project];
          log('agent candidates', { count: items.length, projectCount: project.length });
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

    const apply = async (ctx) => {
      const commandUi = ctx.get('commandUi');
      if (!commandUi?.decorate) throw new TypeError('dsh-quick-invoke requires commandUi.decorate');
      const remote = ctx.get('remote');
      if (!remote?.$mount) throw new TypeError('dsh-quick-invoke requires remote.$mount');
      const mountedDispose = await remote.$mount(projectAgentPresetsRemote);
      const disposers = [commandUi.decorate(skillDecoration(ctx)), commandUi.decorate(agentDecoration(ctx)), commandUi.decorate(pluginDecoration(ctx))];
      log('command decorations registered');
      const cleanup = () => disposers.reverse().forEach((dispose) => dispose?.());
      log('client applied');
      const dispose = async () => {
        cleanup();
        await mountedDispose?.();
      };
      return ctx.effect ? ctx.effect(() => dispose, 'dsh-quick-invoke command decorations') : dispose;
    };

    return { apply, inject: ['commandUi', 'connection', 'sessions', 'remote'] };
  }
});
