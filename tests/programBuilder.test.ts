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
  it('EMOM lesté connu (12 kg × 6/min) → tractions lestées à 12 kg, charge connue, calibration, pas un max', () => {
    const known = [{ variantId: 'pullup-weighted', loadKg: 12, reps: 6, source: 'EMOM 12 min × 6 rép. à 12 kg' }];
    const p = buildProgram({ ...base, maxPullups: null, priority: 'muscle' }, loads, [6, 12], known);
    const l = p.templates.flatMap((t) => t.lines).find((x) => x.variantId === 'pullup-weighted')!;
    expect(l.loadKg).toBe(12);
    expect(l.cue).toMatch(/calibr/);
    expect(l.targetRir).toBeGreaterThanOrEqual(2);
    expect(l.lastSetToFailure).toBe(false);
    expect(p.notes.join(' ')).toContain('pas un max');
    expect(p.notes.join(' ')).toContain('propre à ce format');
    // Dips inconnus : calibration sous-maximale, jamais de test maximal.
    const d = buildProgram({ ...base, maxDips: null }, loads);
    const dl = d.templates.flatMap((t) => t.lines).find((x) => x.variantId === 'dips-bars')!;
    expect(dl.cue).toContain('sous-maximale');
    expect(d.templates.flatMap((t) => t.lines).filter((x) => x.variantId === 'dips-bars' && /max/i.test(x.cue ?? '') && !/pas de max/.test(x.cue ?? ''))).toEqual([]);
    // Aucune ligne lestée sans charge.
    expect(p.templates.flatMap((t) => t.lines).filter((x) => x.variantId === 'pullup-weighted' && !x.loadKg)).toEqual([]);
    // Douleur aux coudes : la charge connue n'est pas imposée.
    const safe = buildProgram({ ...base, pains: ['coudes'] }, loads, [6, 12], known);
    expect(safe.templates.flatMap((t) => t.lines).some((x) => x.variantId === 'pullup-weighted')).toBe(false);
  });

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

  it('gras sur cuisses/fessiers : sèche conseillée sans promettre de perte localisée ; une zone de gras ne fixe PAS le volume musculaire', () => {
    const a = { ...base, fatZones: ['cuisses' as const, 'fessiers' as const] };
    expect(recPriority(a)).toMatchObject({ value: 'seche' });
    expect(recPriority(a)!.why).toContain('ne fond pas');
    const p = buildProgram({ ...a, priority: 'seche', minutes: 75 }, loads);
    const b = p.templates.find((t) => t.key === 'B')!;
    expect(b.lines.some((l) => l.variantId === 'glute-bridge-kb')).toBe(false);
    expect(p.notes.join(' ')).toContain('jamais sur une seule zone');
    // priorité fessiers demandée comme zone MUSCULAIRE : alors seulement, le travail est ajouté
    const wanted = buildProgram({ ...base, muscleZones: ['fessiers' as const], priority: 'seche', minutes: 75 }, loads);
    expect(wanted.templates.find((t) => t.key === 'B')!.lines.some((l) => l.variantId === 'glute-bridge-kb')).toBe(true);
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
