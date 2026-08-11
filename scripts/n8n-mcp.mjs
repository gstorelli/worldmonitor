#!/usr/bin/env node
/**
 * Risk Sentinel — n8n MCP helper CLI.
 *
 * Talks to the external n8n MCP server (https://automata.opencyber.org/mcp-server/http)
 * over JSON-RPC-over-HTTP. Used by operators/scripts to discover the tools n8n
 * exposes and to trigger n8n workflows programmatically (pipeline automation).
 *
 * Usage:
 *   node scripts/n8n-mcp.mjs list-tools
 *   node scripts/n8n-mcp.mjs call <toolName> [<jsonArgs>]
 *
 * Environment:
 *   API_MCP_N8N  — Bearer token for the MCP server (required; see .env.example)
 *   N8N_MCP_URL  — MCP endpoint (default: https://automata.opencyber.org/mcp-server/http)
 *   N8N_MCP_TOKEN — alternative token source (API_MCP_N8N wins)
 */

const DEFAULT_MCP_URL = 'https://automata.opencyber.org/mcp-server/http';
const PROTOCOL_VERSION = '2025-03-26';

const url = process.env.N8N_MCP_URL || DEFAULT_MCP_URL;
const token = process.env.API_MCP_N8N || process.env.N8N_MCP_TOKEN || '';

let sessionId = null;

function logError(message) {
  console.error(`[n8n-mcp] ${message}`);
}

function headers(extra = {}) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
    ...extra,
  };
}

/**
 * MCP HTTP responses use the Streamable HTTP transport: the body can be a
 * plain JSON object or a Server-Sent-Events stream. Parse either.
 */
async function parseMcpResponse(response, label) {
  const contentType = String(response.headers.get('content-type') || '');
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed (HTTP ${response.status}): ${raw.slice(0, 500)}`);
  }
  const incomingSession = response.headers.get('mcp-session-id');
  if (incomingSession) sessionId = incomingSession;

  if (contentType.includes('text/event-stream')) {
    const messages = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        messages.push(JSON.parse(data));
      } catch {
        // Keep-alive or comment lines — ignore.
      }
    }
    if (messages.length === 0) throw new Error(`${label} returned empty SSE stream`);
    // In SSE mode each event can be a complete JSON-RPC response message.
    return messages;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${label} returned non-JSON body: ${raw.slice(0, 300)}`);
  }
  return [parsed];
}

async function jsonRpc(method, params = {}) {
  const payload = {
    jsonrpc: '2.0',
    id: Math.floor(Math.random() * 1_000_000),
    method,
    params,
  };
  const response = await fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
  return parseMcpResponse(response, method);
}

function assertResult(messages, method) {
  const message = messages[0];
  if (!message) throw new Error(`${method}: no response`);
  if (message.error) throw new Error(`${method} error: ${JSON.stringify(message.error)}`);
  return message.result;
}

async function initialize() {
  const messages = await jsonRpc('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'risk-sentinel-cli', version: '1.0.0' },
  });
  const result = assertResult(messages, 'initialize');
  // Fire-and-forget initialized notification (notifications are notifications,
  // not requests — send with id: null).
  await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  }).catch(() => {});
  return result;
}

async function listTools() {
  await initialize();
  const messages = await jsonRpc('tools/list', {});
  const result = assertResult(messages, 'tools/list');
  return result.tools || [];
}

async function callTool(name, args = {}) {
  await initialize();
  const messages = await jsonRpc('tools/call', { name, arguments: args });
  const result = assertResult(messages, `tools/call ${name}`);
  return result;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command) {
    logError('usage: n8n-mcp.mjs list-tools | call <toolName> [jsonArgs]');
    process.exit(2);
  }
  if (!token) {
    logError('API_MCP_N8N (or N8N_MCP_TOKEN) is not set — add it to .env / the environment');
    process.exit(2);
  }

  if (command === 'list-tools') {
    const tools = await listTools();
    console.log(JSON.stringify(
      tools.map((t) => ({ name: t.name, description: t.description || '', inputSchema: t.inputSchema || {} })),
      null,
      2,
    ));
  } else if (command === 'call') {
    const toolName = rest[0];
    if (!toolName) {
      logError('call requires a tool name');
      process.exit(2);
    }
    let args = {};
    if (rest[1]) {
      try {
        args = JSON.parse(rest[1]);
      } catch {
        logError(`args must be valid JSON: ${rest[1]}`);
        process.exit(2);
      }
    }
    const result = await callTool(toolName, args);
    console.log(JSON.stringify(result, null, 2));
  } else {
    logError(`unknown command: ${command}`);
    process.exit(2);
  }
}

main().catch((error) => {
  logError(error.message || String(error));
  process.exit(1);
});