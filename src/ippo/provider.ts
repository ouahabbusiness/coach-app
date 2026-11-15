// Fournisseur LLM compatible OpenAI (DeepSeek, OpenAI, etc.).
// La clé est stockée uniquement dans IndexedDB sur cet appareil et n'est envoyée qu'au fournisseur choisi.

import type { Repository } from '../storage/db';
import { DEFAULT_IPPO_CONFIG, type ChatTurn, type IppoConfig } from './types';

const KEY = 'ippo.config';

export async function loadIppoConfig(repo: Repository): Promise<IppoConfig> {
  const saved = await repo.getKv<Partial<IppoConfig>>(KEY);
  return { ...DEFAULT_IPPO_CONFIG, ...(saved ?? {}) };
}

export async function saveIppoConfig(repo: Repository, config: IppoConfig): Promise<void> {
  await repo.setKv(KEY, config);
}

export function hasApiKey(config: IppoConfig): boolean {
  return config.apiKey.trim().length >= 20;
}

export class IppoError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'IppoError';
  }
}

function endpoint(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (base.endsWith('/chat/completions')) return base;
  return `${base}/chat/completions`;
}

interface AskOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxTokens?: number;
}

/** Envoie la conversation au fournisseur et renvoie le texte de la réponse. */
export async function askIppo(config: IppoConfig, turns: ChatTurn[], opts: AskOptions = {}): Promise<string> {
  if (!hasApiKey(config)) throw new IppoError('Aucune clé API enregistrée.');
  if (typeof fetch !== 'function') throw new IppoError('Réseau indisponible dans cet environnement.');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45_000);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(endpoint(config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: config.model.trim(),
        messages: turns,
        temperature: 0.4,
        max_tokens: opts.maxTokens ?? 700,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new IppoError('Clé refusée par le fournisseur. Vérifie-la dans les réglages Ippo.', res.status);
      if (res.status === 429) throw new IppoError('Trop de requêtes ou quota atteint. Réessaie dans quelques minutes.', res.status);
      if (res.status >= 500) throw new IppoError('Le fournisseur est indisponible pour le moment. Réessaie plus tard.', res.status);
      throw new IppoError(`Le fournisseur a refusé la requête (HTTP ${res.status}).`, res.status);
    }

    const data: unknown = await res.json();
    const content = extractContent(data);
    if (!content) throw new IppoError('Réponse vide du fournisseur. Réessaie.');
    return content;
  } catch (err) {
    if (err instanceof IppoError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') throw new IppoError('Délai dépassé. Vérifie ta connexion et réessaie.');
    throw new IppoError(err instanceof Error ? `Connexion impossible : ${err.message}` : 'Connexion impossible.');
  } finally {
    clearTimeout(timeout);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

function extractContent(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as { message?: { content?: unknown } } | undefined;
  const content = first?.message?.content;
  return typeof content === 'string' && content.trim() !== '' ? content.trim() : null;
}

/** Test court : demande au modèle de répondre « OK ». */
export async function testIppoConfig(config: IppoConfig): Promise<string> {
  return askIppo(
    config,
    [
      { role: 'system', content: 'Réponds uniquement par OK.' },
      { role: 'user', content: 'Test de connexion.' },
    ],
    { maxTokens: 5, timeoutMs: 20_000 },
  );
}
