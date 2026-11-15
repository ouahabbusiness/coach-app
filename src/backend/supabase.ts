// Client Supabase — chargé uniquement si VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY existent.
// La clé publishable est publique par conception ; la clé service_role ne doit jamais arriver ici.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const backendConfigured = url.length > 0 && key.length > 0;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!backendConfigured) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Implicite : le lien email fonctionne même s'il est ouvert dans un autre onglet
        // (le flux PKCE exige le verifier du navigateur d'origine et échoue sinon).
        flowType: 'implicit',
      },
    });
  }
  return client;
}
