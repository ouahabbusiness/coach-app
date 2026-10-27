import { describe, expect, it } from 'vitest';
import { validGtin } from '../src/ui/Kitchen';

describe('numéro de code-barres saisi à la main', () => {
  it('accepte des numéros valides (EAN-13, EAN-8, UPC-A)', () => {
    expect(validGtin('4006381333931')).toBe(true);
    expect(validGtin('96385074')).toBe(true);
    expect(validGtin('036000291452')).toBe(true);
  });
  it('refuse une faute de frappe, une mauvaise longueur ou des lettres', () => {
    expect(validGtin('4006381333932')).toBe(false);
    expect(validGtin('400638133393')).toBe(false);
    expect(validGtin('40063813339a1')).toBe(false);
    expect(validGtin('')).toBe(false);
  });
});
