import { z } from "zod";
import { askBuffer, AskBufferError, getAskBufferConfig } from "@/lib/ask-buffer";
import { askHistoryLimit, askQuestionLimit, askReplyLimit, type AskAnswer } from "@/lib/ask-buffer-types";
import { todayInZone } from "@/lib/finance";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const maxBodySize = 160_000;
const requestSchema = z.strictObject({
  consent: z.literal(true),
  messages: z.array(z.discriminatedUnion("role", [
    z.strictObject({ role: z.literal("user"), text: z.string().trim().min(1).max(askQuestionLimit) }),
    z.strictObject({ role: z.literal("assistant"), text: z.string().trim().min(1).max(askReplyLimit) }),
  ])).min(1).max(askHistoryLimit).refine(messages => messages.length % 2 === 1
    && messages.every((message, index) => message.role === (index % 2 ? "assistant" : "user"))),
});

function json(body: AskAnswer | { error: string } | { remaining: number }, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET() {
  if (!getSupabaseConfig()) return json({ error: "Ask Buffer is unavailable." }, 503);
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "Sign in again to use Ask Buffer." }, 401);
  const { data: remaining, error } = await supabase.rpc("ask_buffer_remaining");
  if (error || typeof remaining !== "number") return json({ error: "Message count is unavailable." }, 503);
  return json({ remaining });
}

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Open Ask Buffer from your dashboard." }, 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return json({ error: "Send a JSON chat request." }, 415);
  }
  if (!getSupabaseConfig()) return json({ error: "Ask Buffer is unavailable." }, 503);
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "Sign in again to use Ask Buffer." }, 401);

  const config = getAskBufferConfig();
  if (!config) return json({ error: "Ask Buffer is still being set up." }, 503);
  if (Number(request.headers.get("content-length")) > maxBodySize) return json({ error: "Start a new chat and try again." }, 413);
  const body = await request.text();
  if (Buffer.byteLength(body) > maxBodySize) return json({ error: "Start a new chat and try again." }, 413);
  let input: unknown;
  try { input = JSON.parse(body); }
  catch { return json({ error: "Send a valid chat request." }, 400); }
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return json({ error: "Confirm data sharing and enter a valid question." }, 400);

  const { data: reserved, error: quotaError } = await supabase.rpc("consume_ask_buffer_turn");
  if (quotaError) return json({ error: "Ask Buffer is temporarily unavailable." }, 503);
  if (!reserved) return json({ error: "You’ve reached today’s limit of 20 questions. It resets at midnight UTC." }, 429);

  const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
  const timeout = AbortSignal.timeout(45_000);
  try {
    const answer = await askBuffer(supabase, config, parsed.data.messages, todayInZone(profile?.timezone ?? "UTC"),
      AbortSignal.any([request.signal, timeout]));
    return json(answer);
  } catch (error) {
    if (timeout.aborted) return json({ error: "The answer took too long. Try a shorter question." }, 504);
    return json({ error: error instanceof AskBufferError ? error.message : "Ask Buffer couldn’t answer. Try again." }, 502);
  }
}
