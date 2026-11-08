"use server";

import { revalidatePath } from "next/cache";
import { mcpSecret, newMcpKey, type McpKeyState } from "@/lib/mcp-access";
import { createClient } from "@/lib/supabase/server";

export async function manageMcpKey(_previous: McpKeyState, formData: FormData): Promise<McpKeyState> {
  const intent = formData.get("intent");
  if (intent !== "issue" && intent !== "revoke") return { error: "Choose a key action." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in again to manage your MCP key." };

  if (intent === "revoke") {
    const { error } = await supabase.from("mcp_keys").delete().eq("user_id", user.id);
    if (error) return { error: "Couldn’t revoke the key. Try again." };
    revalidatePath("/dashboard/connections");
    return {};
  }

  const secret = mcpSecret();
  if (!secret) return { error: "MCP is disabled for this deployment." };
  const { token, digest } = newMcpKey(secret);
  const { error } = await supabase.rpc("set_buffer_mcp_key", {
    key_digest: digest,
    edits: formData.get("allow_edits") === "on",
  });
  if (error) return { error: "Couldn’t create the key. Try again." };
  revalidatePath("/dashboard/connections");
  return { token };
}
