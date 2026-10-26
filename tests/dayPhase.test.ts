import { describe, expect, it } from 'vitest';
import { pastBedtime, phaseAt } from '../src/engine/dayPhase';

const at = (h: number, m = 0) => h * 60 + m;

describe('moment de la journée', () => {
  it('suit les heures de coucher et de lever déclarées (nuit 1 h avant le coucher)', () => {
    expect(phaseAt(at(8), '23:30', '07:00')).toBe('matin');
    expect(phaseAt(at(14), '23:30', '07:00')).toBe('jour');
    expect(phaseAt(at(20), '23:30', '07:00')).toBe('soir');
    expect(phaseAt(at(22, 30), '23:30', '07:00')).toBe('nuit');
    expect(phaseAt(at(3), '23:30', '07:00')).toBe('nuit');
  });

  it('gère un coucher après minuit', () => {
    expect(phaseAt(at(23, 30), '00:30', '08:00')).toBe('nuit');
    expect(phaseAt(at(23), '00:30', '08:00')).toBe('soir');
  });

  it('pas de rappel sans heure de coucher déclarée', () => {
    expect(pastBedtime(at(1))).toBe(false);
  });

  it('rappel seulement entre le coucher et le lever', () => {
    expect(pastBedtime(at(23, 40), '23:30', '07:00')).toBe(true);
    expect(pastBedtime(at(23, 10), '23:30', '07:00')).toBe(false);
    expect(pastBedtime(at(6, 50), '23:30', '07:00')).toBe(true);
    expect(pastBedtime(at(7, 5), '23:30', '07:00')).toBe(false);
  });
});
