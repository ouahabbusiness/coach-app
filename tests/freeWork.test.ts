// Données de test fictives, inspirées du format déclaré (EMOM 12 min × 6 tractions, lest 12 kg) — pas le dossier réel.
import { describe, expect, it } from 'vitest';
import { nextEmom, summarize, type FreeBlock } from '../src/engine/freeWork';
import { availableLoads, DEFAULT_PIECES } from '../src/engine/progression';

const loads = availableLoads(DEFAULT_PIECES);
const emom = (extra: Partial<FreeBlock> = {}): FreeBlock => ({ id: 'e', day: '2026-10-26', at: 0, format: 'emom', variantId: 'pullup-weighted', grip: 'pronation', strict: true, loadKg: 12, targetPerRound: 6, rounds: Array(12).fill(6), secondsPerRound: 20, difficultyStart: 5, difficultyEnd: 8, ...extra });

describe('EMOM saisi comme travail effectué', () => {
  it('72 rép. à 12 kg enregistrées, repos réel 40 s, incertitude affichée', () => {
    const s = summarize(emom());
    expect(s).toMatchObject({ totalReps: 72, roundsDone: 12, tonnage: 864, restSeconds: 40 });
    expect(s.uncertain[0]).toContain('12 passages ≠ 12 séries');
  });

  it('jamais « plus la prochaine fois » sans données : difficulté/récupération manquantes → maintenir et observer', () => {
    const d = nextEmom([emom({ difficultyEnd: undefined })], loads);
    expect(d.action).toBe('maintenir et observer');
    expect(d.missing).toContain('difficulté de fin');
  });

  it('première réussite → répéter pour vérifier ; deux réussites + bonne récup → plus petit incrément réel (12 → 16 kg ici)', () => {
    expect(nextEmom([emom()], loads, true).action).toBe('répéter');
    const d = nextEmom([emom(), emom()], loads, true);
    expect(d).toMatchObject({ action: 'augmenter le lest', next: { loadKg: 16, targetPerRound: 6 } });
  });

  it('minutes ratées → une répétition de moins ; douleur → sécurité', () => {
    expect(nextEmom([emom({ rounds: [6, 6, 6, 6, 6, 6, 6, 6, 5, 5, 4, 4] })], loads, true)).toMatchObject({ action: 'réduire les répétitions', next: { targetPerRound: 5 } });
    expect(nextEmom([emom({ pain: 'coude' })], loads, true).action).toBe('sécurité');
  });
});
