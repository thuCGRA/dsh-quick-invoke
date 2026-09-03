import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverProjectAgentPresets, mergeAgentPresetCandidates } from '../src/project-agent-presets.js';

test('discovers project Agent presets from nearest .dsh root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-quick-invoke-'));
  const preset = join(root, '.dsh', 'agent-presets', 'frontend');
  await mkdir(preset, { recursive: true });
  await writeFile(join(preset, 'preset.yml'), 'name: Frontend Agent\ndescription: Project frontend\n');
  await writeFile(join(preset, 'agent.cordis.yml'), '- id: persona\n  name: test-persona\n');
  const result = await discoverProjectAgentPresets(join(root, 'src'));
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    id: 'frontend', label: 'Frontend Agent', description: 'Project frontend', source: 'project',
    projectRoot: root, presetPath: preset, compositionPath: join(preset, 'agent.cordis.yml'),
    status: 'unregistered', registered: false, selectable: false,
    reason: undefined, revision: result[0].revision
  });
});

test('reports a project preset missing its composition as broken', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-quick-invoke-'));
  await mkdir(join(root, '.dsh', 'agent-presets', 'reviewer'), { recursive: true });
  const result = await discoverProjectAgentPresets(root);
  assert.equal(result[0].status, 'broken');
  assert.equal(result[0].reason, 'missing agent.cordis.yml');
});

test('merges Agent candidates into a canonical contract and rejects duplicate ids', () => {
  const result = mergeAgentPresetCandidates(
    [{ id: 'review', label: 'Project review', source: 'project', status: 'unregistered', revision: 'p1' }],
    [{ name: 'review', description: 'Global review', trust: 'user' }, { id: 'build', name: 'Build', broken: true }]
  );
  assert.equal(result.length, 3);
  assert.equal(result[0].ambiguous, false);
  assert.equal(result[0].selectable, false);
  assert.equal(result[0].registered, false);
  assert.equal(result[1].ambiguous, false);
  assert.equal(result[1].selectable, true);
  assert.equal(result[1].selectionKey, 'user:review');
  assert.equal(result[2].id, 'build');
  assert.equal(result[2].status, 'broken');
  assert.equal(result[2].selectable, false);
});
