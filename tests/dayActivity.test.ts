// Bilan d'activité du jour et tapis variable (données fictives).
import { describe, expect, it } from 'vitest';
import { estimateEnergy } from '../src/engine/activity';
import { dayStepsTotal, challengeValues } from '../src/engine/daily';
import { dayActivityReport, totalSteps } from '../src/engine/dayActivity';

const training = { strengthMinPerWeek: 134, runKmPerWeek: 5.5 };

describe('tapis : variation et origine de la vitesse', () => {
  const act = (t: object) => ({ v: 2 as const, steps: 700, treadmill: t });
  it('jours plus courts : comptés tels quels, pas lissés en silence', () => {
    const full = estimateEnergy({ bmr: 1815, weightKg: 79, activity: act({ daysPerWeek: 5, minutes: 130, speedKmh: 5 }), training })!;
    const mixed = estimateEnergy({ bmr: 1815, weightKg: 79, activity: act({ daysPerWeek: 5, minutes: 130, shortDays: 2, shortMinutes: 60, speedKmh: 5 }), training })!;
    expect(mixed.maintenance).toBeLessThan(full.maintenance);
    expect(mixed.lines.join(' ')).toMatch(/3 j × 130 min \+ 2 j × 60 min/);
  });
  it('vitesse lue sur le tapis ou estimée : dit dans le détail', () => {
    const shown = estimateEnergy({ bmr: 1815, weightKg: 79, activity: act({ daysPerWeek: 4, minutes: 100, speedKmh: 5, speedShown: true }), training })!;
    const guess = estimateEnergy({ bmr: 1815, weightKg: 79, activity: act({ daysPerWeek: 4, minutes: 100, speedKmh: 5, speedShown: false }), training })!;
    expect(shown.lines.join(' ')).toMatch(/\(affichés\)/);
    expect(guess.lines.join(' ')).toMatch(/\(estimés\)/);
    expect(guess.notes.join(' ')).toMatch(/Vitesse estimée/);
    // la vitesse n'est jamais modifiée pour retrouver un objectif de pas : même calcul, seule l'étiquette change
    expect(guess.maintenance).toBe(shown.maintenance);
  });
});

describe('pas du jour : deux modes, jamais mélangés', () => {
  it('séparé : montre + tapis ; total : le tapis n’est jamais ajouté une seconde fois', () => {
    expect(totalSteps({ steps: 700, treadmillSteps: 9300, mode: 'separe' })).toBe(10000);
    expect(totalSteps({ steps: 10000, treadmillSteps: 9300, mode: 'total' })).toBe(10000);
    expect(dayStepsTotal({ steps: 700, treadmillSteps: 9300, updatedAt: 0 })).toBe(10000);
    expect(dayStepsTotal({ steps: 10000, treadmillSteps: 9300, stepsMode: 'total', updatedAt: 0 })).toBe(10000);
    expect(challengeValues(undefined, { steps: 10000, treadmillSteps: 9300, stepsMode: 'total', updatedAt: 0 }).steps).toBe(10000);
  });
});

describe('bilan d’activité du jour', () => {
  const base = { weightKg: 79 };
  it('journée en cours : bilan partiel, rien n’est conclu', () => {
    const r = dayActivityReport({ ...base, steps: 700, mode: 'separe' });
    expect(r.status).toBe('partielle');
    expect(r.lines.join(' ')).toMatch(/Journée en cours : bilan partiel/);
    expect(dayActivityReport({ ...base, steps: 700, mode: 'separe', final: true }).status).toBe('terminée');
  });
  it('données manquantes nommées, jamais comblées par zéro', () => {
    expect(dayActivityReport({ ...base, mode: 'separe' }).missing).toContain('pas hors tapis (montre)');
    expect(dayActivityReport({ ...base, mode: 'total' }).missing).toContain('total de pas du jour');
    expect(dayActivityReport({ ...base, steps: 9000, mode: 'total' }).missing).toContain('ce que le total comprend (tapis, courses)');
  });
  it('séparé : pas hors tapis, tapis (vitesse connue) et course comptés à part', () => {
    const r = dayActivityReport({ ...base, steps: 700, treadmillSteps: 9300, mode: 'separe', treadmill: { speedKmh: 5 }, runKm: 1.5, final: true });
    expect(r.lines.join(' | ')).toMatch(/700 pas hors tapis \(déclarés\)/);
    expect(r.lines.join(' | ')).toMatch(/9\s300 pas de tapis .* ≈ 7 km \(estimation : longueur de pas supposée de 0,75 m, non mesurée chez toi\) .* à 5 km\/h/);
    expect(r.lines.join(' | ')).toMatch(/course : 1,5 km .*comptée à part/);
    expect(r.kcal).toBeGreaterThan(300);
  });
  it('total : tapis et course compris ne sont pas recomptés ; pas de tapis saisis ignorés et dit', () => {
    const r = dayActivityReport({ ...base, steps: 10000, treadmillSteps: 9300, mode: 'total', includes: ['tapis', 'courses'], runKm: 1.5 });
    expect(r.lines.join(' ')).not.toMatch(/course : /);
    expect(r.issues.join(' ')).toMatch(/ignorés en mode total/);
    expect(r.issues.join(' ')).toMatch(/dépense réelle est sous-estimée/);
    expect(r.kcal).toBe(Math.round(10000 * 0.5 * 79 * 0.75 / 1000));
  });
  it('incohérence signalée sans remplacer les données ; seulement quand la journée est terminée', () => {
    const t = { minutes: 130, speedKmh: 5 };
    const early = dayActivityReport({ ...base, treadmillSteps: 3000, mode: 'separe', treadmill: t });
    expect(early.issues).toEqual([]);
    const late = dayActivityReport({ ...base, treadmillSteps: 3000, mode: 'separe', treadmill: t, final: true });
    expect(late.issues.join(' ')).toMatch(/distance calculée à partir de la durée et de la vitesse \(≈ 10,8 km\) diffère de celle estimée à partir des pas/);
    expect(late.issues.join(' ')).toMatch(/longueur de pas et la précision des appareils étant incertaines/);
    expect(late.issues.join(' ')).toMatch(/Aucune donnée n’a été remplacée/);
    // aucune des deux sources n'est déclarée fausse
    expect(late.issues.join(' ')).not.toMatch(/faux|erreur|incohérent/i);
    // cohérent : rien à signaler
    expect(dayActivityReport({ ...base, treadmillSteps: 14000, mode: 'separe', treadmill: t, final: true }).issues).toEqual([]);
  });
  it('estimés : étiquette « estimés » ; le bilan ne parle jamais de cible alimentaire à modifier', () => {
    const r = dayActivityReport({ ...base, steps: 5000, mode: 'separe', measured: false });
    expect(r.lines.join(' ')).toMatch(/estimés/);
    expect(JSON.stringify(r)).not.toMatch(/cible alimentaire à/);
  });
});
