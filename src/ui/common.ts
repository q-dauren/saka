import type { AsykSkinId, Difficulty, GameMode, LocationId, TakiaId } from '../types';
import { injectStyles } from './styles';

export function uiRoot(): HTMLElement {
  let r = document.getElementById('ui-root');
  if (!r) { r = document.createElement('div'); r.id = 'ui-root'; document.body.appendChild(r); }
  injectStyles();
  return r;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function testBanner(): HTMLElement {
  return h('div', 'sk-test', 'ТЕСТОВЫЙ РЕЖИМ, реальные платежи не списываются');
}

export interface Modal { root: HTMLElement; body: HTMLElement; close(): void }

export function openModal(title: string, opts: { test?: boolean } = {}): Modal {
  const r = uiRoot();
  r.querySelectorAll('.sk-overlay').forEach((n) => n.remove());
  const ov = h('div', 'sk-overlay');
  const card = h('div', 'sk-card');
  const head = h('div', 'sk-head');
  const x = h('button', 'sk-x', '✕');
  x.type = 'button';
  x.setAttribute('aria-label', 'Закрыть');
  head.append(h('h2', 'sk-title', title), x);
  card.append(head);
  if (opts.test) card.append(testBanner());
  const body = h('div', 'sk-body');
  card.append(body);
  ov.append(card);
  r.append(ov);
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  function close() {
    document.removeEventListener('keydown', onKey);
    ov.classList.add('sk-out');
    setTimeout(() => ov.remove(), 180);
  }
  x.onclick = close;
  ov.addEventListener('pointerdown', (e) => { if (e.target === ov) close(); });
  document.addEventListener('keydown', onKey);
  return { root: ov, body, close };
}

export function toast(text: string): void {
  const r = uiRoot();
  let box = r.querySelector('.sk-toasts') as HTMLElement | null;
  if (!box) { box = h('div', 'sk-toasts'); r.append(box); }
  const t = h('div', 'sk-toast', text);
  box.append(t);
  setTimeout(() => t.classList.add('out'), 2700);
  setTimeout(() => t.remove(), 3000);
}

export function tile(name: string, svg: string, on: boolean, locked: boolean): HTMLButtonElement {
  const b = h('button', 'sk-tile' + (on ? ' on' : '') + (locked ? ' lock' : ''));
  b.type = 'button';
  const pv = h('div', 'sk-pv');
  pv.innerHTML = svg;
  b.append(pv, h('div', 'sk-tname', name));
  if (locked) b.append(h('span', 'sk-lockicon', '🔒'));
  return b;
}

export const starsText = (n: number): string => '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));

export const DIFF_NAMES: Record<Difficulty, string> = { easy: 'Лёгкая', medium: 'Средняя', hard: 'Сложная' };
export const MODE_NAMES: Record<GameMode, string> = { solo: 'Соло', local2: 'Вдвоём', online: 'Онлайн' };

export const SKINS: { id: AsykSkinId; name: string; price: number; free: boolean }[] = [
  { id: 'classic', name: 'Классика', price: 0, free: true },
  { id: 'silver', name: 'Серебро', price: 0, free: true },
  { id: 'gold', name: 'Золото', price: 149, free: false },
  { id: 'ornament', name: 'Орнамент', price: 149, free: false },
  { id: 'glow', name: 'Свечение', price: 199, free: false },
];
export const TAKIAS: { id: TakiaId; name: string; price: number; free: boolean }[] = [
  { id: 'classic', name: 'Классика', price: 0, free: true },
  { id: 'festive', name: 'Праздничная', price: 99, free: false },
  { id: 'gold', name: 'Золотая', price: 149, free: false },
  { id: 'modern', name: 'Современная', price: 99, free: false },
];
export const LOCATIONS: { id: LocationId; name: string; grad: string }[] = [
  { id: 'summer_yard', name: 'Летний двор', grad: 'linear-gradient(135deg,#1B2A19,#2D5128 50%,#537B2F)' },
  { id: 'jailau', name: 'Джайлау', grad: 'linear-gradient(135deg,#8DA750,#E4EDB0 60%,#CB6325)' },
  { id: 'night_almaty', name: 'Ночной Алматы', grad: 'linear-gradient(135deg,#21263A,#274558 60%,#EDB57C)' },
  { id: 'winter_yard', name: 'Зимний двор', grad: 'linear-gradient(135deg,#E0D5C1,#8F9A7E 60%,#8B8672)' },
];

// ---------- процедурные миниатюры ----------
let gid = 0;
export function skinSvg(id: AsykSkinId): string {
  const g = 'skg' + ++gid;
  const pal: Record<AsykSkinId, [string, string, string]> = {
    classic: ['#E0D5C1', '#b9ab8f', '#8B8672'],
    silver: ['#f4f6f8', '#9aa3ad', '#6b7480'],
    gold: ['#fbe7a1', '#d99a2b', '#8a5a12'],
    ornament: ['#E0D5C1', '#c9b894', '#85150F'],
    glow: ['#E4EDB0', '#8DA750', '#2D5128'],
  };
  const [a, b, s] = pal[id];
  const orn = id === 'ornament'
    ? '<path d="M22 30l5-5 5 5-5 5zM32 30l5-5 5 5-5 5zM27 38l5-5 5 5-5 5z" fill="#85150F"/>' : '';
  const glow = id === 'glow' ? ' style="filter:drop-shadow(0 0 5px #E4EDB0) drop-shadow(0 0 10px #8DA750)"' : '';
  return `<svg viewBox="0 0 64 64" width="64" height="64"${glow}><defs><radialGradient id="${g}" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs><path d="M14 20Q10 32 14 44Q22 54 32 50Q42 54 50 44Q54 32 50 20Q42 10 32 14Q22 10 14 20Z" fill="url(#${g})" stroke="${s}" stroke-width="2"/><path d="M20 32Q32 26 44 32" fill="none" stroke="${s}" stroke-width="1.5" opacity=".6"/>${orn}</svg>`;
}

export function takiaSvg(id: TakiaId): string {
  const pal: Record<TakiaId, [string, string, string]> = {
    classic: ['#274558', '#E0D5C1', '#8F9A7E'],
    festive: ['#85150F', '#EDB57C', '#CB6325'],
    gold: ['#E9B949', '#fbe7a1', '#8a5a12'],
    modern: ['#190406', '#8F9A7E', '#21263A'],
  };
  const [dome, brim, acc] = pal[id];
  return `<svg viewBox="0 0 64 64" width="64" height="64"><path d="M10 40Q10 12 32 12Q54 12 54 40Z" fill="${dome}" stroke="#000" stroke-opacity=".4" stroke-width="1.5"/><rect x="8" y="40" width="48" height="9" rx="3" fill="${brim}" stroke="#000" stroke-opacity=".4" stroke-width="1.5"/><path d="M12 45l4-3 4 3 4-3 4 3 4-3 4 3 4-3 4 3 4-3 4 3" fill="none" stroke="${acc}" stroke-width="1.5"/><path d="M32 12V8" stroke="${acc}" stroke-width="3"/></svg>`;
}

export function proSvg(): string {
  return '<svg viewBox="0 0 64 64" width="64" height="64"><path d="M8 48L12 20l12 14 8-20 8 20 12-14 4 28z" fill="#EDB57C" stroke="#CB6325" stroke-width="2"/><rect x="8" y="50" width="48" height="6" rx="2" fill="#CB6325"/></svg>';
}
