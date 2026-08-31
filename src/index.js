import { registerCommands } from './command-runtime.js';
import { createDshAdapter } from './dsh-adapter.js';

/** Stable Cordis plugin name. */
export const name = 'dsh-quick-invoke';

/** Host services required by the command handlers. */
export const inject = ['commands', 'skills', 'agentPresets', 'pluginInventory'];

/**
 * Host entry point.
 */
export function apply(ctx) {
  if (!ctx || typeof ctx !== 'object') {
    throw new TypeError('dsh-quick-invoke requires a Cordis context');
  }
  return registerCommands(ctx, createDshAdapter(ctx));
}
