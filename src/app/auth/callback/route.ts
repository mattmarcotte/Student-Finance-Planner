import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const config = getSupabaseConfig();
  const code = request.nextUrl.searchParams.get("code");
  const providerError = request.nextUrl.searchParams.get("error");

  if (providerError || !code || !config) {
    const reason = providerError === "access_denied"
      ? "cancelled"
      : !config ? "unavailable" : "callback_failed";
    const response = NextResponse.redirect(new URL(`/login?error=${reason}`, request.url));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  // Use one response so session cookies and cache headers survive the redirect.
  // The destination is fixed; user-supplied redirect URLs are never accepted.
  const response = NextResponse.redirect(new URL("/dashboard", request.url));
  response.headers.set("Cache-Control", "private, no-store");
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers ?? {}).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
      },
    },
  });

  try {
    const flowId = request.nextUrl.searchParams.get("sb_flow_id");
    const { error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    if (error) {
      response.headers.set("Location", new URL("/login?error=callback_failed", request.url).href);
    }
  } catch {
    response.headers.set("Location", new URL("/login?error=callback_failed", request.url).href);
  }
  return response;
}
