#!/usr/bin/env node
// A small local MCP adapter exposing the deterministic token functions over
// stdio. Deliberately hand-rolled instead of pulling in a full MCP SDK: the
// stdio transport is just newline-delimited JSON-RPC 2.0 messages, and this
// workshop only needs two read-only, local, deterministic tools.
import readline from 'node:readline';
import { getTokens, validateTokenPairing } from './token-functions.mjs';

const TOOLS = [
  {
    name: 'get_tokens',
    description:
      'Finds a token and related tokens by exact token path or semantic role. Intent terms are supported, for example "saved" finds success tokens.',
    inputSchema: {
      type: 'object',
      properties: {
        token: { type: 'string', description: 'An exact or partial token path, such as success.fg' },
        role: { type: 'string' },
        theme: { type: 'string', enum: ['light', 'dark'] },
      },
      required: ['theme'],
      anyOf: [{ required: ['token'] }, { required: ['role'] }],
    },
  },
  {
    name: 'validate_token_pairing',
    description:
      'Validates a foreground/background token pairing for both WCAG contrast and approved semantic compatibility.',
    inputSchema: {
      type: 'object',
      properties: {
        foreground: { type: 'string' },
        background: { type: 'string' },
        theme: { type: 'string', enum: ['light', 'dark'] },
      },
      required: ['foreground', 'background', 'theme'],
    },
  },
];

function callTool(name, args) {
  switch (name) {
    case 'get_tokens':
      return getTokens(args.token, args.role, args.theme);
    case 'validate_token_pairing':
      return validateTokenPairing(args.foreground, args.background, args.theme);
    default:
      throw new Error(`Unknown tool "${name}"`);
  }
}

export function handleRequest(request) {
  const { id, method, params } = request;
  try {
    let result;
    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'design-tokens-mcp', version: '1.0.0' },
        };
        break;
      case 'tools/list':
        result = { tools: TOOLS };
        break;
      case 'tools/call': {
        const toolResult = callTool(params.name, params.arguments ?? {});
        result = { content: [{ type: 'text', text: JSON.stringify(toolResult) }] };
        break;
      }
      default:
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
    }
    return { jsonrpc: '2.0', id, result };
  } catch (error) {
    return { jsonrpc: '2.0', id, error: { code: -32000, message: error.message } };
  }
}

// Run when executed directly (node mcp/server.mjs)
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let request;
    try {
      request = JSON.parse(trimmed);
    } catch {
      process.stdout.write(
        JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n'
      );
      return;
    }
    const response = handleRequest(request);
    process.stdout.write(JSON.stringify(response) + '\n');
  });
}
