import { bus } from '../core/bus';

export type SfxName = 'hit' | 'throw' | 'out' | 'combo' | 'win' | 'lose' | 'agai' | 'click';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
try { muted = localStorage.getItem('saka.muted') === '1'; } catch { /* ignore */ }
let inited = false;
let lastHit = 0;
let muteBtn: HTMLButtonElement | null = null;

function ensure(): boolean {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return true;
  }
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.7;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  } catch {
    return false;
  }
}

function noise(t: number, dur: number, f0: number, f1: number, q: number, vol: number, type: BiquadFilterType = 'bandpass'): void {
  const s = ctx!.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx!.createBiquadFilter();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master!);
  s.start(t); s.stop(t + dur + 0.02);
}

function tone(t: number, f0: number, f1: number, dur: number, type: OscillatorType, vol: number, lp = 0): void {
  const o = ctx!.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node: AudioNode = o;
  if (lp) {
    const f = ctx!.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lp;
    o.connect(f); node = f;
  }
  node.connect(g); g.connect(master!);
  o.start(t); o.stop(t + dur + 0.02);
}

/** «Домбра»: щипок — треугольник + лёгкий обертон через затухающий lowpass. */
function pluck(t: number, freq: number, dur = 0.7, vol = 0.32): void {
  const o = ctx!.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
  const o2 = ctx!.createOscillator(); o2.type = 'square'; o2.frequency.value = freq * 2.005;
  const g2 = ctx!.createGain(); g2.gain.value = 0.15;
  const f = ctx!.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(2600, t);
  f.frequency.exponentialRampToValueAtTime(320, t + dur);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(master!);
  o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
}

const DEFS: Record<SfxName, (t: number) => void> = {
  hit: (t) => { noise(t, 0.05, 3200, 1800, 4, 0.7); tone(t, 220, 120, 0.07, 'sine', 0.35); },
  throw: (t) => { noise(t, 0.28, 500, 2200, 1.2, 0.35); tone(t, 300, 140, 0.2, 'triangle', 0.12); },
  out: (t) => { DEFS.hit(t); tone(t + 0.05, 520, 780, 0.14, 'triangle', 0.22); },
  combo: (t) => { [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.07, f, f, 0.16, 'triangle', 0.25)); },
  win: (t) => {
    const sc = [293.66, 349.23, 392, 440, 523.25, 587.33]; // минорная пентатоника D
    [0, 2, 3, 4, 3, 5, 4, 3, 5].forEach((n, i) => pluck(t + i * 0.17, sc[n], 0.8));
    [0, 2, 4].forEach((n) => pluck(t + 9 * 0.17, sc[n], 1.4, 0.26));
  },
  lose: (t) => { tone(t, 392, 330, 0.3, 'sawtooth', 0.18, 900); tone(t + 0.3, 311, 196, 0.5, 'sawtooth', 0.18, 700); },
  agai: (t) => {
    const o = ctx!.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(240, t);
    o.frequency.exponentialRampToValueAtTime(130, t + 0.6);
    const l = ctx!.createOscillator(); l.frequency.value = 16;
    const lg = ctx!.createGain(); lg.gain.value = 28;
    l.connect(lg); lg.connect(o.frequency);
    const f = ctx!.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100;
    const g = ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    o.connect(f); f.connect(g); g.connect(master!);
    o.start(t); l.start(t); o.stop(t + 0.7); l.stop(t + 0.7);
  },
  click: (t) => tone(t, 900, 700, 0.04, 'square', 0.07),
};

function play(name: SfxName): void {
  if (muted || !ensure() || !ctx) return;
  if (name === 'hit') {
    const now = performance.now();
    if (now - lastHit < 40) return;
    lastHit = now;
  }
  DEFS[name]?.(ctx.currentTime + 0.001);
}

function vibrate(ms = 30): void {
  try { if (!muted || true) navigator.vibrate?.(ms); } catch { /* ignore */ }
}

function setMuted(v: boolean): void {
  muted = v;
  try { localStorage.setItem('saka.muted', v ? '1' : '0'); } catch { /* ignore */ }
  if (master && ctx) master.gain.setTargetAtTime(v ? 0 : 0.7, ctx.currentTime, 0.02);
  if (muteBtn) muteBtn.textContent = v ? '🔇' : '🔊';
}

function buildMuteButton(): void {
  if (muteBtn || typeof document === 'undefined') return;
  const make = () => {
    muteBtn = document.createElement('button');
    muteBtn.id = 'saka-mute';
    muteBtn.setAttribute('aria-label', 'Звук');
    muteBtn.setAttribute('style', 'position:fixed;right:10px;top:10px;width:40px;height:40px;border-radius:50%;background:rgba(25,4,6,.75);color:#E0D5C1;border:2px solid #CB6325;font-size:18px;z-index:9500;cursor:pointer;padding:0;pointer-events:auto;');
    muteBtn.textContent = muted ? '🔇' : '🔊';
    muteBtn.onclick = () => setMuted(!muted);
    document.body.appendChild(muteBtn);
  };
  if (document.body) make(); else document.addEventListener('DOMContentLoaded', make, { once: true });
}

function init(): void {
  if (inited) return;
  inited = true;
  const unlock = () => {
    if (ensure()) window.removeEventListener('pointerdown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  buildMuteButton();
  document.addEventListener('click', (e) => {
    if ((e.target as HTMLElement | null)?.closest?.('button')) play('click');
  }, true);

  bus.on('throw:start', () => play('throw'));
  bus.on('asyk:out', () => { play('out'); vibrate(30); });
  bus.on('collision', () => play('hit'));
  bus.on('combo', () => play('combo'));
  bus.on('agai:hit', () => { play('agai'); vibrate(30); });
  bus.on('agai:shout', () => play('agai'));
  bus.on('ui:click', () => play('click'));
  bus.on('round:end', (r: any) => play(r && r.won === false ? 'lose' : 'win'));
}

export const sfx = { init, play, setMuted, isMuted: () => muted };

// Идемпотентная автоинициализация при импорте модуля.
if (typeof window !== 'undefined') queueMicrotask(init);