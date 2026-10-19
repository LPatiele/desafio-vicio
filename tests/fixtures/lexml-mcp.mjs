// Local protocol fixture. No legal research or network access.
import { createInterface } from 'node:readline';
const schema = { type: 'object', properties: { query: { type: 'string' }, maximum_records: { type: 'integer' } }, required: ['query'], additionalProperties: false };
const rl = createInterface({ input: process.stdin });
rl.on('line', line => {
  const message = JSON.parse(line);
  if (message.id === undefined) return;
  let result;
  if (message.method === 'initialize') result = { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'lexml-local-fixture', version: 'test-only' } };
  else if (message.method === 'tools/list') result = { tools: [{ name: 'lexml_search', description: 'LOCAL TEST FIXTURE', inputSchema: schema }] };
  else if (message.method === 'tools/call') result = { content: [{ type: 'text', text: JSON.stringify({ fixture: true, inheritedOpenRouterKey: Boolean(process.env.OPENROUTER_API_KEY), number_of_records: 0, records: [], provenance: { backend_name: 'test-only' } }) }] };
  else if (message.method === 'ping') result = {};
  else { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unknown method' } }) + '\n'); return; }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\n');
});
