import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function digest(values) {
  return createHash('sha256').update(values.join('\0')).digest('hex');
}

function parseMetadata(text, fallbackId) {
  const read = (key) => {
    const match = new RegExp('^\\s*' + key + ':\\s*(.*)$', 'm').exec(text);
    return match?.[1]?.trim().replace(/^['"]|['"]$/g, '') || undefined;
  };
  return {
    id: fallbackId,
    name: read('name') ?? fallbackId,
    description: read('description')
  };
}

async function isDirectory(path) {
  try { return (await stat(path)).isDirectory(); } catch { return false; }
}

async function findProjectRoot(cwd) {
  let current = resolve(cwd);
  while (true) {
    const root = join(current, '.dsh', 'agent-presets');
    if (await isDirectory(root)) return { projectRoot: current, presetRoot: root };
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/** Discover project Agent preset directories without mounting or executing them. */
export async function discoverProjectAgentPresets(cwd, { signal } = {}) {
  if (typeof cwd !== 'string' || cwd.length === 0) return [];
  signal?.throwIfAborted?.();
  const project = await findProjectRoot(cwd);
  if (!project) return [];
  const rows = await readdir(project.presetRoot, { withFileTypes: true });
  const candidates = [];
  for (const row of rows) {
    signal?.throwIfAborted?.();
    if (!row.isDirectory() || !ID_PATTERN.test(row.name)) continue;
    const presetDir = join(project.presetRoot, row.name);
    const manifestPath = join(presetDir, 'preset.yml');
    const compositionPath = join(presetDir, 'agent.cordis.yml');
    let manifest = '';
    let composition = '';
    try { manifest = await readFile(manifestPath, 'utf8'); } catch {}
    try { composition = await readFile(compositionPath, 'utf8'); } catch {}
    const metadata = parseMetadata(manifest, row.name);
    const status = composition ? 'unregistered' : 'broken';
    candidates.push({
      id: row.name,
      label: metadata.name,
      description: metadata.description,
      source: 'project',
      registered: false,
      selectable: false,
      projectRoot: project.projectRoot,
      presetPath: presetDir,
      compositionPath,
      status,
      reason: composition ? undefined : 'missing agent.cordis.yml',
      revision: digest([manifest, composition])
    });
  }
  return candidates.sort((a, b) => a.id.localeCompare(b.id));
}

export { ID_PATTERN, mergeAgentPresetCandidates };

function mergeAgentPresetCandidates(project = [], installed = []) {
  const entries = [...project, ...installed].map((entry) => {
    const id = entry.id ?? entry.name;
    const source = entry.source ?? (entry.trust === 'user' ? 'user' : 'deployment');
    const registered = entry.registered ?? source !== 'project';
    const status = entry.status ?? (entry.broken ? 'broken' : registered ? 'available' : 'unregistered');
    return { id, label: entry.label ?? entry.name ?? id, description: entry.description, source, registered, status, reason: entry.reason, revision: entry.revision, selectionKey: `${source}:${id}`, selectable: status === 'available' && registered && entry.selectable !== false };
  });
  const counts = new Map();
  for (const entry of entries) {
    const key = `${entry.source}:${entry.id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return entries.map((entry) => {
    // The official roster already applies DSH root precedence. A local project
    // discovery row with the same id is not an additional official source.
    const ambiguous = counts.get(`${entry.source}:${entry.id}`) > 1;
    return { ...entry, ambiguous, selectable: entry.selectable && !ambiguous };
  });
}
