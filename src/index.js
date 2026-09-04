import { registerCommands } from './command-runtime.js';
import { createDshAdapter } from './dsh-adapter.js';
import { registerProjectAgentPresetsRemote } from './project-agent-presets-remote.js';

/** Stable Cordis plugin name. */
export const name = 'dsh-quick-invoke';

/** Host services required by the command handlers. */
export const inject = ['commands', 'skills', 'agentPresets', 'pluginInventory', 'apiProxy'];

/**
 * Host entry point.
 */
export async function apply(ctx) {
  if (!ctx || typeof ctx !== 'object') {
    throw new TypeError('dsh-quick-invoke requires a Cordis context');
  }
  const disposeCommands = registerCommands(ctx, createDshAdapter(ctx));
  try {
    await registerProjectAgentPresetsRemote(ctx);
  } catch (error) {
    disposeCommands();
    throw error;
  }
  return disposeCommands;
}
