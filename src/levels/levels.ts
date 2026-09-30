import type { Difficulty } from '../types';

export interface Pt { x: number; y: number }
export interface LevelDef { name: string; asyks: Pt[]; throws: number; hintFrac: number }

const P = (x: number, y: number): Pt => ({ x, y });
const ring = (n: number, r: number, off = 0): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = off + (i * 2 * Math.PI) / n;
    return P(Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r));
  });

export const LEVELS: Record<Difficulty, LevelDef[]> = {
  easy: [
    { name: 'Горстка', asyks: [P(0, 0), P(-46, -30), P(46, -30), P(-30, 44), P(30, 44)], throws: 10, hintFrac: 1 },
    { name: 'Ряд', asyks: [-125, -75, -25, 25, 75, 125].map((x) => P(x, 0)), throws: 10, hintFrac: 1 },
    { name: 'Кольцо', asyks: [P(0, 0), ...ring(6, 80)], throws: 12, hintFrac: 1 },
  ],
  medium: [
    { name: 'Два ряда', asyks: [...[-90, -30, 30, 90].map((x) => P(x, -35)), ...[-60, 0, 60].map((x) => P(x, 30)), P(0, 95)], throws: 7, hintFrac: 0.5 },
    { name: 'У края', asyks: [...ring(8, 130, Math.PI / 8), P(-25, 0), P(25, 0)], throws: 7, hintFrac: 0.5 },
    { name: 'Крест', asyks: [P(0, 0), P(45, 0), P(-45, 0), P(0, 45), P(0, -45), P(90, 0), P(-90, 0), P(0, 90), P(0, -90)], throws: 7, hintFrac: 0.5 },
  ],
  hard: [
    { name: 'Плотная россыпь', asyks: [...[-42, 0, 42].map((x) => P(x, -42)), ...[-63, -21, 21, 63].map((x) => P(x, 0)), ...[-42, 0, 42].map((x) => P(x, 42))], throws: 4, hintFrac: 0.25 },
    { name: 'Двойное кольцо', asyks: [...ring(4, 45, Math.PI / 4), ...ring(6, 115)], throws: 4, hintFrac: 0.25 },
    { name: 'Возле края', asyks: [...ring(8, 150, Math.PI / 8), P(-45, 0), P(0, 0), P(45, 0)], throws: 4, hintFrac: 0.25 },
  ],
};

export const TUTORIAL_LEVEL: LevelDef = { name: 'Обучение', asyks: [P(-40, 140), P(50, 130)], throws: 99, hintFrac: 1 };
