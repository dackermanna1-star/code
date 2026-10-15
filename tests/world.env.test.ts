// Sun/moon math and weather presets.
import { describe, expect, it } from 'vitest';
import { DECLINATION_DEG, LATITUDE_DEG, moonDirection, nightFactor, sunColor, sunDirection } from '../src/world/env/celestial';
import { fogVisibilityDistance, lerpWeather, WEATHER_PRESETS, cloneWeather } from '../src/world/env/weather';
import { waveHeight } from '../src/world/water/waves';

const d = { x: 0, y: 0, z: 0 };

describe('celestial', () => {
  it('puts the noon sun due south at the expected elevation', () => {
    sunDirection(12, d);
    const el = (Math.asin(d.y) * 180) / Math.PI;
    expect(el).toBeCloseTo(90 - LATITUDE_DEG + DECLINATION_DEG, 3);
    expect(d.z).toBeGreaterThan(0); // +Z = south
    expect(Math.abs(d.x)).toBeLessThan(1e-6);
  });

  it('rises in the east and sets in the west', () => {
    sunDirection(7, d);
    expect(d.x).toBeGreaterThan(0.5); // +X = east
    sunDirection(17, d);
    expect(d.x).toBeLessThan(-0.5);
    sunDirection(0, d);
    expect(d.y).toBeLessThan(0);
  });

  it('keeps the moon up at night and returns unit vectors', () => {
    for (const hr of [22, 0, 2, 4]) {
      moonDirection(hr, d);
      expect(d.y).toBeGreaterThanOrEqual(0.42 - 1e-9);
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 6);
    }
  });

  it('night factor and sun color behave', () => {
    expect(nightFactor(0.5)).toBe(0);
    expect(nightFactor(-0.3)).toBe(1);
    sunColor(0.9, d);
    const noon = { ...d };
    sunColor(0.03, d);
    expect(d.z / d.x).toBeLessThan(noon.z / noon.x); // redder at sunset
  });
});

describe('weather', () => {
  it('orders visibility distances by weather severity', () => {
    const v = (w: keyof typeof WEATHER_PRESETS) => fogVisibilityDistance(WEATHER_PRESETS[w]);
    expect(v('fog')).toBeLessThan(v('rain'));
    expect(v('rain')).toBeLessThan(v('overcast'));
    expect(v('overcast')).toBeLessThan(v('clear'));
    expect(v('fog')).toBeLessThan(600);
  });

  it('interpolates all parameters', () => {
    const out = cloneWeather(WEATHER_PRESETS.clear);
    lerpWeather(WEATHER_PRESETS.clear, WEATHER_PRESETS.rain, 0.5, out);
    expect(out.rain).toBeCloseTo(0.5);
    expect(out.cloudCover).toBeCloseTo((WEATHER_PRESETS.clear.cloudCover + WEATHER_PRESETS.rain.cloudCover) / 2);
  });

  it('wave height is bounded and calm when attenuated', () => {
    let max = 0;
    for (let i = 0; i < 500; i++) max = Math.max(max, Math.abs(waveHeight(i * 7.3, i * 3.1, i * 0.37, 1)));
    expect(max).toBeLessThan(0.7);
    expect(waveHeight(100, 100, 3, 0)).toBe(0);
  });
});
