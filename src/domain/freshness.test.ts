import { describe, expect, it } from 'vitest';
import { formatLastSeen, isStale } from './freshness';

const now = new Date('2026-11-02T12:00:00.000Z');
const ago = (s: number): string => new Date(now.getTime() - s * 1000).toISOString();

describe('isStale', () => {
  it('null es vieja', () => expect(isStale(null, now)).toBe(true));
  it('59 s no es vieja', () => expect(isStale(ago(59), now)).toBe(false));
  it('60 s exactos no es vieja', () => expect(isStale(ago(60), now)).toBe(false));
  it('61 s es vieja', () => expect(isStale(ago(61), now)).toBe(true));
});

describe('formatLastSeen', () => {
  it('null', () => expect(formatLastSeen(null, now)).toBe('sin señal'));
  it('segundos', () => expect(formatLastSeen(ago(20), now)).toBe('hace 20 s'));
  it('minutos', () => expect(formatLastSeen(ago(185), now)).toBe('hace 3 min'));
  it('60 s son 1 min', () => expect(formatLastSeen(ago(60), now)).toBe('hace 1 min'));
  it('futuro', () => expect(formatLastSeen(ago(-30), now)).toBe('hace 0 s'));
});
