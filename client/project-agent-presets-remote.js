// Generated-style Typert Remote contribution for the project preset roster.
// The browser client mounts this descriptor into DSH's existing remote
// namespace; project paths never cross the client boundary.
const stringSchema = { parse(value) { if (typeof value !== 'string') throw new TypeError('expected string'); return value; } };
const candidateSchema = { parse(value) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string') throw new TypeError('invalid project preset candidate');
  return value;
} };
const resultSchema = { parse(value) {
  if (!value || !Array.isArray(value.candidates)) throw new TypeError('invalid project preset result');
  value.candidates.forEach((candidate) => candidateSchema.parse(candidate));
  return value;
} };

export const TYPERT_REMOTE = {
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
      codec: { mode: 'strict', typeSymbol: '@deepseek-ai/dsh-session/types#SessionId', schema: stringSchema }
    }],
    result: { mode: 'strict', typeSymbol: 'dsh-quick-invoke#ProjectAgentPresetSnapshot', schema: resultSchema }
  }]
};

export default TYPERT_REMOTE;
