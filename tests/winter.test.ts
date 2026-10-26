import { describe, expect, it } from 'vitest';
import { winterInfo } from '../src/ui/winterArc';

describe('thème Winter Arc', () => {
  it('auto : actif seulement du 1er au 30 novembre, avec le numéro du jour', () => {
    expect(winterInfo('auto', '2026-10-26')).toMatchObject({ active: false, daysLeft: 6 });
    expect(winterInfo('auto', '2026-11-01')).toMatchObject({ active: true, day: 1, total: 30 });
    expect(winterInfo('auto', '2026-11-30')).toMatchObject({ active: true, day: 30 });
    expect(winterInfo('auto', '2026-12-01').active).toBe(false);
  });

  it('forcé ou désactivé dans les réglages', () => {
    expect(winterInfo('on', '2026-10-26').active).toBe(true);
    expect(winterInfo('off', '2026-11-05').active).toBe(false);
  });
});
