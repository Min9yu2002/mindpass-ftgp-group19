import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";

export const hasSupabaseUrl = supabaseUrl.length > 0;
export const hasSupabaseAnonKey = supabaseAnonKey.length > 0;
export const hasSupabasePublishableKey = hasSupabaseAnonKey;

let supabase: SupabaseClient | null = null;
let clientInitStatus: "OK" | "Failed" = "Failed";

if (hasSupabaseUrl && hasSupabaseAnonKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    clientInitStatus = "OK";
  } catch {
    supabase = null;
  }
}

export { clientInitStatus, supabase };
