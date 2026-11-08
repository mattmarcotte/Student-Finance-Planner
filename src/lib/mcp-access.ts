import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";

export function mcpSecret() {
  const secret = process.env.BUFFER_MCP_SECRET;
  return secret && /^[a-f0-9]{64}$/i.test(secret) ? secret : null;
}

export function mcpProof(token: string, secret: string) {
  return createHmac("sha256", Buffer.from(secret, "hex")).update(token).digest("hex");
}

export function newMcpKey(secret: string) {
  const token = `buffer_mcp_${randomBytes(32).toString("base64url")}`;
  const digest = createHash("sha256").update(mcpProof(token, secret)).digest("hex");
  return { token, digest };
}

export type McpKeyState = { token?: string; error?: string };
