import { redirect } from "next/navigation";
import { WelcomeScreen } from "@/components/welcome-screen";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ mode?: string; error?: string }>;
}) {
  const params = await searchParams;
  if (getSupabaseConfig()) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/dashboard");
  }
  return <WelcomeScreen mode={params.mode === "signup" ? "signup" : "login"} errorCode={params.error} />;
}
