import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const cloud =
  url && key
    ? createClient(url, key, {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;
export let accountId = "guest";
export function setAccount(id: string | undefined) {
  accountId = id || "guest";
}
export const preferenceKey = (key: string) =>
  accountId === "guest" ? key : `${key}:${accountId}`;
