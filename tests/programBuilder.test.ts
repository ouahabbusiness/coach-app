// Données de test fictives.
import { describe, expect, it } from 'vitest';
import { availableLoads, DEFAULT_PIECES } from '../src/engine/progression';
import { buildProgram, recDays, recIntensity, recPriority, recStrictness, type ProgramAnswers } from '../src/engine/programBuilder';
import { findVariant } from '../src/catalog/exercises';

const loads = availableLoads(DEFAULT_PIECES);
const base: ProgramAnswers = { priority: 'hybride', maxPullups: 10, maxDips: 15, maxPushups: 35, longestRunKm: 5, pains: [], sleepH: 7.5, stress: 'moyen', minutes: 60, slot: 'soir' };

describe('recommandations du coach', () => {
  it('mauvaise récupération → intensité contrôlée et une séance de moins, avec la raison', () => {
    const a = { ...base, sleepH: 6 };
    expect(recIntensity(a)).toMatchObject({ value: 'controlee' });
    expect(recIntensity(a).why).toContain('6 h');
    expect(recDays(a).value).toBe(2);
  });
  it('abandon par manque de motivation → cadre militaire', () => {
    expect(recStrictness({ ...base, quitReason: 'motivation' }).value).toBe('militaire');
  });
});

describe('programme', () => {
  it('hybride : 3 séances + 3 courses, exercices tous dans le catalogue', () => {
    const p = buildProgram(base, loads);
    expect(p.week.filter((w) => w.kind === 'seance')).toHaveLength(3);
    expect(p.week.filter((w) => w.kind === 'course')).toHaveLength(3);
    for (const t of p.templates) for (const l of t.lines) expect(findVariant(l.variantId), l.variantId).toBeDefined();
  });

  it('15 dips → dips lestés avec une charge réalisable ; 10 tractions → tractions strictes', () => {
    const p = buildProgram(base, loads);
    const a = p.templates.find((t) => t.key === 'A')!;
    expect(a.lines[0]!.variantId).toBe('pullup-strict');
    expect(a.lines[1]).toMatchObject({ variantId: 'dips-weighted', loadKg: 5 });
  });

  it('16 tractions → lest 10 kg (pièce réelle) ; épaules douloureuses → pas de dips', () => {
    const p = buildProgram({ ...base, maxPullups: 16, pains: ['epaules'] }, loads);
    const a = p.templates.find((t) => t.key === 'A')!;
    expect(a.lines[0]).toMatchObject({ variantId: 'pullup-weighted', loadKg: 10 });
    expect(p.templates.flatMap((t) => t.lines).some((l) => l.variantId.startsWith('dips') || l.variantId === 'kb-press-1arm')).toBe(false);
  });

  it('séances raccourcies pour tenir dans le temps disponible', () => {
    const p = buildProgram({ ...base, priority: 'force', minutes: 30 }, loads);
    for (const w of p.week.filter((x) => x.kind === 'seance')) expect(w.durationMin).toBeLessThanOrEqual(45);
  });

  it('max inconnu → test en semaine 1, signalé', () => {
    const p = buildProgram({ ...base, maxPullups: null }, loads);
    expect(p.notes.join(' ')).toContain('test');
  });

  it('bloc de 4 semaines : courses qui progressent, re-test la dernière semaine', () => {
    const p = buildProgram({ ...base, runGoal: '5k', intensity: 'dure', weeks: 4 }, loads);
    expect(p.weekly).toHaveLength(4);
    const endurance = (w: number) => p.weekly[w]!.find((x) => x.title.startsWith('Course · endurance'))?.km ?? 0;
    expect(endurance(1)).toBeGreaterThan(endurance(0));
    expect(p.weekly[0]!.some((x) => x.title.includes('fractionné 6 × 400 m'))).toBe(true);
    const last = p.weekly[3]!;
    expect(last.some((x) => x.templateKey === 'T')).toBe(true);
    expect(last.some((x) => x.title.includes('test 5 km chrono'))).toBe(true);
    expect(p.templates.some((t) => t.key === 'T')).toBe(true);
  });

  it('gras sur cuisses/fessiers : sèche conseillée sans promettre de perte localisée, bas du corps renforcé', () => {
    const a = { ...base, fatZones: ['cuisses' as const, 'fessiers' as const] };
    expect(recPriority(a)).toMatchObject({ value: 'seche' });
    expect(recPriority(a)!.why).toContain('ne fond pas');
    const p = buildProgram({ ...a, priority: 'seche', minutes: 75 }, loads);
    const b = p.templates.find((t) => t.key === 'B')!;
    expect(b.lines.some((l) => l.variantId === 'glute-bridge-kb')).toBe(true);
    expect(p.notes.join(' ')).toContain('jamais sur une seule zone');
  });
  it('échec : jamais par défaut ; si accepté, seulement assistance au poids du corps, jamais avec lest ni sur les principaux', () => {
    const lines = (failureOk?: boolean) => buildProgram({ ...base, priority: 'muscle', intensity: 'tres_exigeant', failureOk }, loads).templates.flatMap((t) => t.lines);
    expect(lines().some((l) => l.lastSetToFailure)).toBe(false);
    const withFail = lines(true).filter((l) => l.lastSetToFailure);
    expect(withFail.length).toBeGreaterThan(0);
    expect(withFail.every((l) => !l.loadKg)).toBe(true);
    expect(lines(true).filter((l) => l.sets >= 4 && l.targetRir === 1).every((l) => !l.lastSetToFailure)).toBe(true);
  });
});
