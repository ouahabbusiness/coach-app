// Écran Ippo — coach IA. v0 : l'app parle directement au fournisseur choisi avec une clé locale.
// Aucune donnée n'est envoyée à un serveur Ippo (il n'y en a pas encore) ; la clé ne quitte pas l'appareil.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Send, Settings2, ShieldCheck, WifiOff } from 'lucide-react';
import type { Repository } from '../storage/db';
import { newId } from './support';
import { buildCoachContext } from '../ippo/context';
import { buildChatTurns } from '../ippo/prompt';
import { demoAnswer, welcomeMessage } from '../ippo/demo';
import { askIppo, askIppoProxy, hasApiKey, IppoError, loadIppoConfig, saveIppoConfig, testIppoConfig } from '../ippo/provider';
import { DEFAULT_IPPO_CONFIG, type IppoConfig, type IppoContext, type IppoMessage } from '../ippo/types';
import { CONSENTS, isGranted, withConsent, type Consents } from '../engine/privacy';
import { useSession } from './account';
import './ippo.css';

const CHAT_KEY = 'ippo.chat';
const MAX_STORED = 60;

const SUGGESTIONS = [
  'Analyse ma semaine',
  'Pourquoi je stagne sur les tractions ?',
  'Ajuste mon déjeuner',
  'Je suis fatigué, je m’entraîne quand même ?',
];

const fmtKg = (v: number) => v.toLocaleString('fr-BE', { maximumFractionDigits: 1 });

function fmtDay(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
}

function fmtTime(at: number): string {
  return new Date(at).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
}

export function Ippo({ repo, onBack }: { repo: Repository; onBack: () => void }) {
  const [config, setConfig] = useState<IppoConfig | null>(null);
  const [ctx, setCtx] = useState<IppoContext | null>(null);
  const [messages, setMessages] = useState<IppoMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [consents, setConsents] = useState<Consents | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const { session } = useSession();
  const proxy = Boolean(session);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [cfg, snapshot, saved, storedConsents] = await Promise.all([
        loadIppoConfig(repo),
        buildCoachContext(repo),
        repo.getKv<IppoMessage[]>(CHAT_KEY),
        repo.getKv<Consents>(CONSENTS),
      ]);
      if (!alive) return;
      setConfig(cfg);
      setCtx(snapshot);
      setConsents(storedConsents ?? {});
      if (saved?.length) setMessages(saved);
      else setMessages([{ id: newId(), role: 'assistant', content: welcomeMessage(snapshot), at: Date.now(), origin: 'local' }]);
    })();
    return () => {
      alive = false;
    };
  }, [repo]);

  useEffect(() => {
    if (!messages.length) return;
    repo.setKv(CHAT_KEY, messages.slice(-MAX_STORED)).catch(() => undefined);
  }, [messages, repo]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages, busy]);

  const doSend = useCallback(
    async (question: string) => {
      if (!config && !proxy) return;
      setError(null);
      const user: IppoMessage = { id: newId(), role: 'user', content: question, at: Date.now(), origin: 'local' };
      const history = [...messages, user];
      setMessages(history);
      setBusy(true);
      try {
        const fresh = await buildCoachContext(repo);
        setCtx(fresh);
        let answer: string;
        let origin: IppoMessage['origin'];
        if (proxy) {
          const past = messages
            .filter((m) => m.origin !== 'error')
            .map((m) => ({ role: m.role, content: m.content }));
          answer = await askIppoProxy(question, fresh, past);
          origin = 'llm';
        } else if (config && hasApiKey(config)) {
          answer = await askIppo(config, buildChatTurns(fresh, question, messages));
          origin = 'llm';
        } else {
          answer = demoAnswer(question, fresh);
          origin = 'demo';
        }
        setMessages((prev) => [...prev, { id: newId(), role: 'assistant', content: answer, at: Date.now(), origin }]);
      } catch (err) {
        const msg = err instanceof IppoError ? err.message : 'Je n’ai pas pu répondre. Réessaie.';
        setError(msg);
        setMessages((prev) => [
          ...prev,
          { id: newId(), role: 'assistant', content: `Je n’ai pas pu répondre : ${msg}`, at: Date.now(), origin: 'error' },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [config, messages, proxy, repo],
  );

  const send = useCallback(
    (raw?: string) => {
      const question = (raw ?? input).trim();
      if (!question || busy || (!config && !proxy)) return;
      setInput('');
      const remote = proxy || (config ? hasApiKey(config) : false);
      // Un envoi vers un fournisseur d'IA demande un accord explicite (données de santé).
      if (remote && (!consents || !isGranted(consents, 'ai'))) {
        setPending(question);
        return;
      }
      void doSend(question);
    },
    [busy, config, consents, doSend, input, proxy],
  );

  const acceptAi = useCallback(async () => {
    if (!pending) return;
    const next = withConsent(consents ?? {}, 'ai', true);
    await repo.setKv(CONSENTS, next);
    setConsents(next);
    const question = pending;
    setPending(null);
    void doSend(question);
  }, [consents, doSend, pending, repo]);

  const saveSettings = useCallback(
    async (next: IppoConfig) => {
      await saveIppoConfig(repo, next);
      setConfig(next);
      setSettingsOpen(false);
      setError(null);
    },
    [repo],
  );

  const live = config ? hasApiKey(config) : false;
  const imc = useMemo(() => {
    if (!ctx?.profile.heightCm || !ctx.profile.weightKg) return null;
    return Math.round((ctx.profile.weightKg / (ctx.profile.heightCm / 100) ** 2) * 10) / 10;
  }, [ctx]);

  return (
    <div className="ippo-screen" role="region" aria-label="Ippo, coach IA">
      <header className="ippo-head">
        <button className="ippo-icon" aria-label="Retour" onClick={onBack}>
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <div className="ippo-brand">
          <span className="ippo-logo">IPPO</span>
          <span className={`ippo-status ${proxy || live ? 'on' : 'off'}`}>
            <span className="ippo-dot" aria-hidden="true" />
            {proxy ? 'Serveur' : live ? 'Clé locale' : 'Démo'}
          </span>
        </div>
        <button className="ippo-icon" aria-label="Réglages Ippo" onClick={() => setSettingsOpen(true)}>
          <Settings2 size={20} aria-hidden="true" />
        </button>
      </header>

      <div className="ippo-scroll">
        {ctx && (
          <section className={`ippo-profile ${profileOpen ? 'open' : ''}`} aria-label="Mon profil">
            <button className="ippo-profile-head" onClick={() => setProfileOpen((v) => !v)} aria-expanded={profileOpen}>
              <span className="ippo-kicker">Mon profil</span>
              <span className="ippo-profile-line">
                {ctx.profile.weightKg !== null ? `${fmtKg(ctx.profile.weightKg)} kg` : 'Poids inconnu'}
                {ctx.profile.heightCm !== null ? ` · ${ctx.profile.heightCm} cm` : ''}
                {ctx.goal?.main ? ` · ${ctx.goal.main}` : ''}
              </span>
              <ChevronDown size={18} className="ippo-chevron" aria-hidden="true" />
            </button>
            {profileOpen && (
              <div className="ippo-profile-body">
                <div className="ippo-metrics">
                  <div>
                    <span>Poids</span>
                    <strong>{ctx.profile.weightKg !== null ? `${fmtKg(ctx.profile.weightKg)} kg` : '—'}</strong>
                    <small>{ctx.profile.weightSource ?? 'inconnu'}</small>
                  </div>
                  <div>
                    <span>IMC</span>
                    <strong>{imc ?? '—'}</strong>
                    <small>indicatif</small>
                  </div>
                  <div>
                    <span>Taille</span>
                    <strong>{ctx.profile.waistCm !== null ? `${ctx.profile.waistCm} cm` : '—'}</strong>
                    <small>tour de taille</small>
                  </div>
                  <div>
                    <span>Séances</span>
                    <strong>{ctx.sessions.length}</strong>
                    <small>récentes</small>
                  </div>
                </div>
                {ctx.goal && (ctx.goal.description || ctx.goal.why) && (
                  <p className="ippo-goal">{ctx.goal.description ?? ctx.goal.why}</p>
                )}
                {ctx.gaps.length > 0 && <p className="ippo-gaps">Données manquantes : {ctx.gaps.join(' · ')}.</p>}
              </div>
            )}
          </section>
        )}

        {!proxy && !live && (
          <div className="ippo-banner">
            <WifiOff size={16} aria-hidden="true" />
            <div>
              <strong>Mode démo.</strong> Aucune IA n’est connectée : les réponses viennent de tes données, sans analyse par un modèle.
              <button className="ippo-link" onClick={() => setSettingsOpen(true)}>
                Ajouter ma clé
              </button>
            </div>
          </div>
        )}

        <div className="ippo-thread" aria-live="polite">
          {messages.map((m) => (
            <article key={m.id} className={`ippo-msg ${m.role} ${m.origin === 'error' ? 'error' : ''}`}>
              {m.role === 'assistant' && <span className="ippo-avatar" aria-hidden="true">I</span>}
              <div className="ippo-bubble">
                {m.origin === 'demo' && <span className="ippo-tag">démo</span>}
                {m.origin === 'error' && <span className="ippo-tag err">erreur</span>}
                <div className="ippo-text">{m.content}</div>
                <span className="ippo-time">{fmtTime(m.at)}</span>
              </div>
            </article>
          ))}
          {busy && (
            <article className="ippo-msg assistant">
              <span className="ippo-avatar" aria-hidden="true">I</span>
              <div className="ippo-bubble ippo-typing" aria-label="Ippo réfléchit">
                <span />
                <span />
                <span />
              </div>
            </article>
          )}
          <div ref={endRef} />
        </div>

        {messages.length <= 1 && (
          <div className="ippo-suggestions" role="group" aria-label="Suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="ippo-suggestion" onClick={() => send(s)} disabled={busy}>
                {s}
              </button>
            ))}
          </div>
        )}

        {error && <p className="ippo-error" role="alert">{error}</p>}
      </div>

      <div className="ippo-composer">
        <div className="ippo-inputwrap">
          <textarea
            rows={1}
            value={input}
            placeholder="Demande à Ippo…"
            aria-label="Message pour Ippo"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button className="ippo-send" aria-label="Envoyer" onClick={() => void send()} disabled={busy || input.trim() === ''}>
            <Send size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="ippo-disclaimer">
          <ShieldCheck size={12} aria-hidden="true" /> Ippo peut se tromper. Pas un avis médical. Données locales, jamais revendues.
        </p>
      </div>

      {pending && (
        <div className="ippo-modal" role="dialog" aria-modal="true" aria-label="Accord avant envoi" onClick={(e) => e.target === e.currentTarget && setPending(null)}>
          <div className="ippo-sheet">
            <h2>Avant d’envoyer à Ippo</h2>
            <p className="ippo-note">
              Pour répondre, Ippo envoie {proxy ? 'au proxy Supabase d’Ippo, qui le transmet au fournisseur configuré' : (
                <strong>{(() => { try { return new URL(config?.baseUrl ?? '').host || 'ton fournisseur'; } catch { return 'ton fournisseur'; } })()}</strong>
              )} : ta question, l’historique du chat et un résumé de tes données (profil, objectif, séances récentes, poids, apports du jour, douleurs déclarées).
            </p>
            <p className="ippo-note">
              Ta clé API reste sur cet appareil et n’est pas incluse dans les exports. Rien n’est envoyé en mode démo. Tu peux retirer cet accord dans les réglages.
            </p>
            <div className="ippo-sheet-actions">
              <button className="ippo-btn ghost" onClick={() => setPending(null)}>Annuler</button>
              <button className="ippo-btn" onClick={() => void acceptAi()}>J’accepte</button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && config && (
        <IppoSettings
          initial={config}
          onClose={() => setSettingsOpen(false)}
          onSave={saveSettings}
        />
      )}
    </div>
  );
}

function IppoSettings({ initial, onClose, onSave }: { initial: IppoConfig; onClose: () => void; onSave: (c: IppoConfig) => void }) {
  const [draft, setDraft] = useState<IppoConfig>({ ...initial });
  const [test, setTest] = useState<{ state: 'idle' | 'busy' | 'ok' | 'ko'; msg?: string }>({ state: 'idle' });

  const runTest = async () => {
    setTest({ state: 'busy' });
    try {
      await testIppoConfig(draft);
      setTest({ state: 'ok', msg: 'Réponse reçue. La clé fonctionne.' });
    } catch (err) {
      setTest({ state: 'ko', msg: err instanceof IppoError ? err.message : 'Test impossible.' });
    }
  };

  return (
    <div className="ippo-modal" role="dialog" aria-modal="true" aria-label="Réglages Ippo" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ippo-sheet">
        <div className="ippo-sheet-head">
          <h2>Réglages Ippo</h2>
          <button className="ippo-icon" aria-label="Fermer" onClick={onClose}>
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="ippo-note">
          Ippo utilise une API compatible OpenAI. Ta clé reste dans la base locale de cet appareil et est retirée des exports JSON. Elle n’est envoyée qu’au fournisseur choisi.
        </p>
        <label className="ippo-field">
          <span>Adresse du fournisseur</span>
          <input value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} placeholder={DEFAULT_IPPO_CONFIG.baseUrl} autoComplete="off" />
        </label>
        <label className="ippo-field">
          <span>Modèle</span>
          <input value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} placeholder={DEFAULT_IPPO_CONFIG.model} autoComplete="off" />
        </label>
        <label className="ippo-field">
          <span>Clé API</span>
          <input
            type="password"
            value={draft.apiKey}
            onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
            placeholder="sk-…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="ippo-sheet-actions">
          <button className="ippo-btn ghost" onClick={runTest} disabled={test.state === 'busy' || !draft.apiKey.trim()}>
            {test.state === 'busy' ? 'Test…' : 'Tester la clé'}
          </button>
          <button className="ippo-btn" onClick={() => onSave({ ...draft, baseUrl: draft.baseUrl.trim(), model: draft.model.trim(), apiKey: draft.apiKey.trim() })}>
            Enregistrer
          </button>
        </div>
        {test.state === 'ok' && <p className="ippo-test ok">{test.msg}</p>}
        {test.state === 'ko' && <p className="ippo-test ko">{test.msg}</p>}
        <p className="ippo-note small">
          Sans clé, Ippo reste en mode démo : il répond à partir de tes données, sans modèle de langage. Aucun serveur Ippo n’existe encore :
          la synchronisation et le proxy sécurisé arrivent avec le backend Supabase.
        </p>
      </div>
    </div>
  );
}
