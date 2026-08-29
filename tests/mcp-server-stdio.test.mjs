import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const serverPath = path.join(rootDir, 'mcp', 'server.mjs');

// Sends one JSON-RPC request to a freshly spawned server process over real
// stdin/stdout and returns the parsed response line. Proves the newline
// delimited stdio transport works end-to-end, not just the handler function.
function sendRequest(request) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverPath], { cwd: rootDir });
    let output = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('MCP server did not respond in time'));
    }, 5000);

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes('\n')) {
        clearTimeout(timeout);
        child.kill();
        resolve(JSON.parse(output.trim().split('\n')[0]));
      }
    });
    child.stderr.on('data', (chunk) => {
      clearTimeout(timeout);
      child.kill();
      reject(new Error(`MCP server wrote to stderr: ${chunk}`));
    });
    child.on('error', reject);

    child.stdin.write(JSON.stringify(request) + '\n');
  });
}

describe('MCP adapter over real stdio', () => {
  it('responds to a tools/list request through the spawned process', async () => {
    const response = await sendRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(response.result.tools).toHaveLength(2);
  });

  it('responds to a tools/call request through the spawned process', async () => {
    const response = await sendRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'get_token_set',
        arguments: { role: 'interactive-link', theme: 'light' },
      },
    });
    const payload = JSON.parse(response.result.content[0].text);
    expect(payload.theme).toBe('light');
    expect(payload.foreground).toBe('accent.fg');
  });
});
