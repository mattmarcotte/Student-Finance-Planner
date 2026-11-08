import { redirect } from "next/navigation";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function AskPage() {
  if (!getSupabaseConfig()) redirect("/login?error=unavailable");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  redirect("/dashboard?ask=1");
}
