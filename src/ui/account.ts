// Session Supabase (magic link) et état de connexion, utilisés par l'écran Compte et Ippo.

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '../backend/supabase';

export function useSession(): { session: Session | null; ready: boolean; configured: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const sb = getSupabase();

  useEffect(() => {
    const client = getSupabase();
    if (!client) {
      setReady(true);
      return;
    }
    client.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        setReady(true);
      })
      .catch(() => setReady(true));
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return { session, ready, configured: Boolean(sb) };
}

export async function sendMagicLink(email: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Backend non configuré.');
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo } });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
}
