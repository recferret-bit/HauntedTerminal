#!/usr/bin/env node
// credits-forge: a stdio MCP server that lets an agent check and save level specs. Spec: .kiro/specs/mcp-devtools-and-forge/.
// Started by the agents table (scripts/harness/agents-build.mjs) as `node scripts/mcp/credits-forge/server.mjs` from the repo root.
// stdout belongs to the protocol: anything the game's modules print is sent to stderr instead.
console.log = (...parts) => console.error(...parts);

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';
import { createContext, ForgeError, TOOLS } from './tools.mjs';

const chapter = z.string().min(1).max(80).describe('chapter folder slug, as list_levels shows it');
const levelId = z.string().min(1).max(80).describe('level id, as list_levels shows it');
const spec = z.record(z.string(), z.unknown()).describe('a complete level spec object (the content of level.spec.json)');

/** Input shapes per tool; tools.mjs checks them again, so a direct call cannot skip them. */
const INPUTS = {
  list_assets: { kind: z.enum(['all', 'models', 'rooms', 'fx']).optional() },
  list_levels: { chapter: chapter.optional() },
  get_level: { chapter, levelId },
  validate_level: { chapter, spec: spec.optional(), levelId: levelId.optional() },
  solve_level: { chapter, spec: spec.optional(), levelId: levelId.optional() },
  write_level: { chapter, levelId, spec, baseEtag: z.string().min(1).describe('the etag get_level returned for this level') },
};
const READ_ONLY = { readOnlyHint: true, openWorldHint: false };
const ANNOTATIONS = { write_level: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } };

const asText = (value, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], ...(isError ? { isError } : {}) });

export function createServer(ctx = createContext()) {
  const server = new McpServer({ name: 'credits-forge', version: '1.0.0' });
  for (const [name, tool] of Object.entries(TOOLS)) {
    server.registerTool(name, { description: tool.description, inputSchema: INPUTS[name], annotations: ANNOTATIONS[name] ?? READ_ONLY }, async (input) => {
      try {
        return asText(await tool.run(ctx, input));
      } catch (err) {
        if (err instanceof ForgeError) return asText({ error: err.code, message: err.message, ...(err.details ?? {}) }, true);
        console.error(err);
        return asText({ error: 'internal', message: String(err?.message ?? err) }, true);
      }
    });
  }
  return { server, ctx };
}

async function main() {
  const { server, ctx } = createServer();
  const stop = async () => {
    await ctx.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.stdin.on('close', stop);
  await server.connect(new StdioServerTransport());
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main().catch((err) => {
  console.error(err);
  process.exit(1);
});
