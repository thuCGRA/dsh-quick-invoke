export const inject = ['commandUi', 'connection', 'sessions'];

const listSkillOptions = async (ctx, session, signal) => {
  const response = await ctx.connection.api.skills.list({ sessionId: session.sessionId }, signal);
  if (!response.result?.ok) return [];
  return (response.result.value.skills ?? []).map((skill) => ({ id: skill.name, label: skill.name, detail: skill.description }));
};

const listAgentOptions = async (ctx) => {
  const response = await ctx.connection.api.agentPresets.list({});
  if (!response.result?.ok) return [];
  return (response.result.value.presets ?? []).filter((preset) => !preset.broken)
    .map((preset) => ({ id: preset.id, label: preset.id, detail: preset.description }));
};

// DSH's popup controller exposes a composer-focus hook internally, but older
// Web builds do not bind that hook from InputBar. Keep selection usable on
// those builds by returning focus to the rendered composer after its draft
// update has been queued. This deliberately does not submit the message.
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
  const actx = ctx.sessions.scope(session.sessionId);
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
};

export function apply(ctx) {
  if (!ctx?.commandUi?.decorate) throw new TypeError('dsh-quick-invoke requires commandUi.decorate');
  const decoration = (name, options, command) => ({
    name,
    available: () => true,
    ui: { kind: 'popupSelect', options, onSelect: (option, session) => fillComposer(ctx, command, option, session) }
  });
  return [
    ctx.commandUi.decorate(decoration('skill', (session, signal) => listSkillOptions(ctx, session, signal), 'skill')),
    ctx.commandUi.decorate(decoration('agent', () => listAgentOptions(ctx), 'agent')),
    ctx.commandUi.decorate(decoration('plugin', async () => [
      { id: 'list', label: 'list', detail: 'List installed plugins' },
      { id: 'inspect', label: 'inspect', detail: 'Inspect a plugin' },
      { id: 'open', label: 'open', detail: 'Open a plugin Web UI' }
    ], 'plugin'))
  ];
}
