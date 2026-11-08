import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createClient } from "@supabase/supabase-js";
import { mcpProof, mcpSecret } from "@/lib/mcp-access";
import { createMcpServer } from "@/lib/mcp-tools";
import { getSupabaseConfig } from "@/lib/supabase/config";

const noStore = { "Cache-Control": "private, no-store" };

function unauthorized() {
  return new Response(null, { status: 401, headers: { ...noStore, "WWW-Authenticate": 'Bearer realm="Buffer MCP"' } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(request.url).origin) {
    return new Response(null, { status: 403, headers: noStore });
  }
  const secret = mcpSecret();
  const config = getSupabaseConfig();
  // A privileged key would bypass the MCP row policies.
  if (!secret || !config?.key.startsWith("sb_publishable_")) {
    return new Response(null, { status: 404, headers: noStore });
  }

  const token = /^Bearer (buffer_mcp_[A-Za-z0-9_-]{43})$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return unauthorized();

  const supabase = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { "x-buffer-mcp-proof": mcpProof(token, secret) },
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: request.signal }),
    },
  });
  const { data: key, error } = await supabase.from("mcp_keys").select("allow_edits").maybeSingle();
  if (error) return new Response(null, { status: 503, headers: noStore });
  if (!key) return unauthorized();

  const server = createMcpServer(supabase, key.allow_edits);
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    response.headers.set("Cache-Control", noStore["Cache-Control"]);
    return response;
  } finally {
    await server.close();
  }
}

// This endpoint uses stateless JSON responses. It does not open a standalone stream.
export function GET() {
  return new Response(null, { status: 405, headers: { ...noStore, Allow: "POST" } });
}
