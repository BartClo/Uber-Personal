import { describe, expect, it } from 'vitest';
import { formatDistanceKm, haversineKm } from './distance';

describe('haversineKm', () => {
  it('mismo punto es 0', () => {
    const p = { lat: -33.4378, lng: -70.6505 };
    expect(haversineKm(p, p)).toBe(0);
  });
  it('Plaza de Armas a Costanera Center ≈ 4.7 km', () => {
    const d = haversineKm({ lat: -33.4378, lng: -70.6505 }, { lat: -33.4173, lng: -70.6064 });
    expect(Math.abs(d - 4.7)).toBeLessThanOrEqual(0.3);
  });
});

describe('formatDistanceKm', () => {
  it('null', () => expect(formatDistanceKm(null)).toBe('—'));
  it('1.2', () => expect(formatDistanceKm(1.2)).toBe('1,2 km'));
  it('4', () => expect(formatDistanceKm(4)).toBe('4,0 km'));
});
