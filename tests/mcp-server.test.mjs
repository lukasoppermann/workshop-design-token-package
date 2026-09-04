import { describe, it, expect } from 'vitest';
import { handleRequest } from '../mcp/server.mjs';

describe('MCP adapter request handling (in-process)', () => {
  it('responds to initialize', () => {
    const response = handleRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    expect(response.result.serverInfo.name).toBe('design-tokens-mcp');
  });

  it('lists the two workshop tools with their required inputs', () => {
    const response = handleRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(response.result.tools).toMatchObject([
      { name: 'get_tokens', inputSchema: { required: ['theme'] } },
      {
        name: 'validate_token_pairing',
        inputSchema: { required: ['foreground', 'background', 'theme'] },
      },
    ]);
  });

  it('calls get_tokens via tools/call', () => {
    const response = handleRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'get_tokens',
        arguments: { role: 'saved', theme: 'dark' },
      },
    });
    const payload = JSON.parse(response.result.content[0].text);
    expect(payload.theme).toBe('dark');
    expect(payload.matchedRole).toBe('success');
    expect(payload.tokens).toContainEqual({ name: 'success.fg', value: '#6fdd8b' });
  });

  it('returns a clear tool error for an unknown token search', () => {
    const response = handleRequest({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'get_tokens', arguments: { role: 'button', theme: 'dark' } },
    });

    expect(response.error.message).toMatch(/No tokens found for "button"/);
  });

  it('calls validate_token_pairing via tools/call and surfaces the semantic failure', () => {
    const response = handleRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'validate_token_pairing',
        arguments: { foreground: 'fg.default', background: 'canvas.subtle', theme: 'dark' },
      },
    });
    const payload = JSON.parse(response.result.content[0].text);
    expect(payload.approved).toBe(false);
    expect(payload.contrastRatio).toBeGreaterThanOrEqual(payload.minimumRequired);
    expect(payload.reason).toContain('not an approved semantic pairing');
  });

  it('returns a JSON-RPC error for an unknown method', () => {
    const response = handleRequest({ jsonrpc: '2.0', id: 6, method: 'not/a/method' });
    expect(response.error.code).toBe(-32601);
  });

  it('returns a JSON-RPC error for an unknown tool', () => {
    const response = handleRequest({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'notARealTool', arguments: {} },
    });
    expect(response.error).toBeDefined();
  });
});
