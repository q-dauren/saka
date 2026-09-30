export const W = 720;
export const H = 1280;
export const KON = { x: 360, y: 600, r: 200 };
export const SAKA_START = { x: 360, y: 1080 };
export const FIELD = { top: 280, bottom: 1220 };
export const AIM_ZONE_TOP = 860;
export const MAX_PULL = 180;
export const MIN_PULL = 26;
export const MAX_SPEED = 38;
export const SETTLE_V = 0.05;
export const SETTLE_FRAMES = 20;
export const ASYK = { w: 24, h: 34 };
export const SAKA_R = 26;
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
