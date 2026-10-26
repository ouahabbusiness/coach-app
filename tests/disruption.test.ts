// Données de test fictives.
import { describe, expect, it } from 'vitest';
import { disruptionOptions, estimateMinutes, keepFeasible, lighten, shorten, type PlanLine } from '../src/engine/disruption';
import { itemStatus, type PlannedItem } from '../src/engine/planning';

const name = (v: string) => v;
const lines: PlanLine[] = [
  { variantId: 'warmup', kind: 'reps', role: 'warmup', sets: 1, targetReps: 10, restSeconds: 60 },
  { variantId: 'pullup-band', kind: 'reps', role: 'work', sets: 4, targetReps: 8, restSeconds: 120 },
  { variantId: 'pushup-standard', kind: 'reps', role: 'work', sets: 3, targetReps: 10, restSeconds: 90 },
  { variantId: 'plank-forearm', kind: 'hold', role: 'work', sets: 3, targetSeconds: 30, restSeconds: 60 },
];

describe('options selon l’imprévu', () => {
  it('malade ou douleur : jamais de version « allégée », seulement annuler ou reporter', () => {
    for (const r of ['maladie', 'douleur'] as const) {
      expect(disruptionOptions(r).map((o) => o.id)).toEqual(['annuler', 'reporter']);
    }
  });
  it('retard : raccourcir en premier', () => {
    expect(disruptionOptions('retard')[0]!.id).toBe('raccourcir');
  });
  it('mauvaise nuit : garder la séance reste un choix possible', () => {
    expect(disruptionOptions('mauvaise_nuit').map((o) => o.id)).toContain('garder');
  });
});

describe('versions adaptées', () => {
  it('l’estimation de durée additionne séries et repos', () => {
    // (45+60) + (4×45+3×120+120) + (3×45+2×90+90) + (3×30+2×60) = 1380 s → 23 min
    expect(estimateMinutes(lines)).toBe(23);
  });

  it('raccourcir tient dans le temps disponible et liste ce qui est retiré', () => {
    const r = shorten(lines, 15, name);
    expect(r.estimatedMin).toBeLessThanOrEqual(15);
    expect(r.lines[0]!.role).toBe('warmup');
    expect(r.lines.every((l) => l.sets >= 1)).toBe(true);
    expect(r.removed.length).toBeGreaterThan(0);
  });

  it('raccourcir avec très peu de temps retire les derniers exercices mais garde au moins une ligne', () => {
    const r = shorten(lines, 3, name);
    expect(r.lines.length).toBeGreaterThanOrEqual(1);
    expect(r.removed).toContain('plank-forearm');
  });

  it('raccourcir ne change rien si le temps suffit', () => {
    const r = shorten(lines, 60, name);
    expect(r.lines).toEqual(lines);
    expect(r.removed).toEqual([]);
  });

  it('alléger retire environ un tiers des séries de travail, échauffement intact', () => {
    const r = lighten(lines, name);
    expect(r.lines.map((l) => l.sets)).toEqual([1, 3, 2, 2]);
  });

  it('garder les exercices faisables retire ceux qui demandent du matériel absent, sans remplacement inventé', () => {
    const equip: Record<string, string[]> = { warmup: [], 'pullup-band': ['barre fixe', 'élastique'], 'pushup-standard': [], 'plank-forearm': [] };
    const r = keepFeasible(lines, (v) => equip[v] ?? [], ['élastique'], name);
    expect(r.lines.map((l) => l.variantId)).toEqual(['warmup', 'pushup-standard', 'plank-forearm']);
    expect(r.removed).toEqual(['pullup-band']);
  });
});

describe('statuts après imprévu', () => {
  const base: PlannedItem = { id: 'i', weekStart: '2026-11-02', day: 0, start: '18:00', durationMin: 45, kind: 'seance', title: 'Haut', moves: [] };

  it('annulée ou suspendue : statut explicite, pas « non confirmé »', () => {
    expect(itemStatus({ ...base, adjustment: { reason: 'retard', decision: 'annulée', at: 0 } }, '2026-11-02', '2026-11-05', [])).toBe('annulé');
    expect(itemStatus({ ...base, adjustment: { reason: 'maladie', decision: 'suspendue', at: 0 } }, '2026-11-02', '2026-11-05', [])).toBe('suspendu');
  });

  it('une séance adaptée réalisée est « adaptée », pas « réalisée »', () => {
    const adapted = { ...base, sessionId: 's1', adapted: { lines, estimatedMin: 15, removed: [] } };
    expect(itemStatus(adapted, '2026-11-02', '2026-11-02', [{ id: 's1', title: 'Haut (adaptée)', outcome: 'completed' }])).toBe('adapté');
  });

  it('lien par identifiant : une autre séance du même nom ne compte pas', () => {
    const linked = { ...base, sessionId: 's1' };
    expect(itemStatus(linked, '2026-11-02', '2026-11-02', [{ id: 'autre', title: 'Haut', outcome: 'completed' }])).toBe('prévu');
  });
});

describe('rigueur du programme appliquée aux imprévus', () => {
  it('strict : plus de report ; militaire : ni report, ni annulation ; maladie : toujours libre', async () => {
    const { disruptionOptions, nonWorkoutOptions } = await import('../src/engine/disruption');
    const ids = (r: Parameters<typeof disruptionOptions>[0], s: Parameters<typeof disruptionOptions>[1]) => disruptionOptions(r, s).map((o) => o.id);
    expect(ids('retard', 'strict')).toEqual(['raccourcir', 'annuler']);
    expect(ids('retard', 'militaire')).toEqual(['raccourcir']);
    expect(ids('mauvaise_nuit', 'militaire')).toEqual(['garder', 'alleger']);
    expect(ids('maladie', 'militaire')).toEqual(['annuler', 'reporter']);
    expect(nonWorkoutOptions('retard', 'militaire').map((o) => o.id)).toEqual(['remplacer_marche']);
  });
});
