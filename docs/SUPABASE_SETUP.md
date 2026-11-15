# Backend Supabase — mise en route

> **État au 15/11/2026** : projet `ngkbccpwciwhcmkinwub` créé, schéma appliqué et vérifié via l’API. La fonction `ippo-chat` n’est **pas encore déployée**. La PWA contient la connexion magic link et la synchro manuelle.

Objectif : comptes, synchro multi-appareil et proxy du coach IA **sans jamais mettre la clé du fournisseur LLM dans la PWA**.

## 1. Créer le projet

1. <https://supabase.com/dashboard> → **New project** (région Europe si possible, ex. `eu-central-1`).
2. Note : **Project URL**, **anon public key**, **service_role key** (Réglages → API).
3. Authentication → URL Configuration :
   - Site URL : `https://ouahabbusiness.github.io/coach-app/`
   - Redirect URLs : `https://ouahabbusiness.github.io/coach-app/`, `https://ouahabbusiness.github.io/coach-app/**` et `http://localhost:5173/**`
4. Authentication → Providers → **Email** activé (magic link). Désactiver l'inscription publique si tu veux un seul compte.

## 2. Schéma

Option A — Dashboard → SQL Editor : coller `supabase/migrations/202611150001_ippo_core.sql`, exécuter.

Option B — CLI :

```bash
npx supabase login
npx supabase link --project-ref <ref-du-projet>
npx supabase db push
```

Le script crée : `profiles`, `session_events` (append-only, `id` client = idempotence), `kv_docs` (last-write-wins), `ippo_messages`, `ippo_usage`, les politiques RLS, le trigger de profil et la fonction de quota.

## 3. Déployer la fonction `ippo-chat`

Dashboard → Edge Functions → **Deploy a new function** → nom `ippo-chat`, coller `supabase/functions/ippo-chat/index.ts`.

Ou CLI :

```bash
npx supabase functions deploy ippo-chat
```

Puis les secrets (Dashboard → Edge Functions → Secrets, ou CLI) :

```bash
npx supabase secrets set \
  LLM_API_KEY=sk-... \
  LLM_BASE_URL=https://api.deepseek.com/v1 \
  LLM_MODEL=deepseek-chat \
  APP_ORIGINS=https://ouahabbusiness.github.io,http://localhost:5173 \
  IPPO_DAILY_LIMIT=60
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont injectés automatiquement : **ne pas** les mettre dans la PWA.

## 4. Tester

1. Créer un utilisateur (Authentication → Users → Add user, ou magic link depuis l'app une fois l'auth branchée).
2. Récupérer un JWT utilisateur, puis :

```bash
curl -i "https://<ref>.supabase.co/functions/v1/ippo-chat" \
  -H "Authorization: Bearer <JWT_UTILISATEUR>" \
  -H "Content-Type: application/json" \
  -d '{"question":"Analyse ma semaine","context":{"profile":{"weightKg":79.8},"sessions":[]},"history":[]}'
```

Réponse attendue : `{"answer":"..."}`. Sans JWT : 401. Au-delà du quota : 429.

## 5. Côté PWA

Dans `.env.local` (jamais commité) :

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

Étape suivante (non branchée) : écran de connexion magic link, adaptateur de synchro `events`/`kv`, et bascule de l'écran Ippo vers l'Edge Function quand la session existe. Le mode « clé locale » reste le secours hors ligne.

## Sécurité — ce qui est garanti, ce qui ne l'est pas

Garanti par le schéma :

- RLS : un utilisateur ne lit et n'écrit que ses lignes ; `ippo_usage` n'est écrit que par le service.
- `verify_jwt = true` sur la fonction : pas d'appel sans session.
- La clé LLM et la clé service ne quittent pas Supabase.
- Aucun contenu de message n'est loggé : seuls des codes (`ippo_upstream_status`, `ippo_quota_error`).

Non garanti à ce stade :

- Pas encore de journal d'audit des appels, ni de limite par minute (seulement un quota quotidien).
- La synchro n'est pas implémentée : le schéma est prêt, pas le client.
- Aucun test exécuté contre un vrai projet Supabase dans cette session (pas d'accès au projet).
