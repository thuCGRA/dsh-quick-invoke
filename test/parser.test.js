import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSlash } from '../src/parser.js';

test('parses a skill with a prompt', () => {
  assert.deepEqual(parseSlash('/skill quick-invoke-test 验证命令'), {
    matched: true,
    command: {
      kind: 'skill',
      name: 'quick-invoke-test',
      prompt: '验证命令',
      rawInput: '/skill quick-invoke-test 验证命令'
    }
  });
});

test('parses agent and read-only plugin commands', () => {
  assert.equal(parseSlash('/agent quick-invoke-agent').command.kind, 'agent');
  assert.equal(parseSlash('/plugin list').command.subcommand, 'list');
  assert.equal(parseSlash('/plugin inspect demo').command.name, 'demo');
  assert.equal(parseSlash('/plugin open demo').command.name, 'demo');
});

test('rejects unsupported commands and plugin mutations', () => {
  assert.equal(parseSlash('/tool demo').matched, false);
  assert.equal(parseSlash('@skill:demo').matched, false);
  assert.equal(parseSlash('$NAME').matched, false);
  assert.equal(parseSlash('/plugin enable demo').matched, false);
  assert.equal(parseSlash('/plugin disable demo').matched, false);
});

test('does not treat URLs, inline text, code blocks, or escaped slashes as commands', () => {
  assert.equal(parseSlash('https://example.com/a/b').matched, false);
  assert.equal(parseSlash('请执行 /skill quick-invoke-test').matched, false);
  assert.equal(parseSlash('`/skill quick-invoke-test`').matched, false);
  assert.equal(parseSlash('\\/skill quick-invoke-test').matched, false);
});

test('rejects malformed and unknown slash commands explicitly', () => {
  assert.equal(parseSlash('/skill').error.code, 'MISSING_NAME');
  assert.equal(parseSlash('/plugin').error.code, 'MISSING_SUBCOMMAND');
  assert.equal(parseSlash('/unknown demo').error.code, 'UNKNOWN_COMMAND');
});
