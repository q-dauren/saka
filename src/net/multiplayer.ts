/// <reference types="vite/client" />
import type Phaser from 'phaser';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { bus } from '../core/bus';
import { toast } from '../ui';
import type { AsykSkinId, BodyState, Difficulty, LocationId, TakiaId } from '../types';
import {
  MAX_RESEND,
  SETTLED_TIMEOUT_MS,
  type HelloMsg,
  type MsgName,
  type ProtocolMap,
  type Role,
  type SettledMsg,
  type StartMsg,
  type ThrowMsg,
  type TurnRef,
} from './protocol';

/* ───────────── Клиент Supabase и профиль (без жёстких зависимостей от чужих файлов) ───────────── */

const supaMods = import.meta.glob('../services/supabase.ts', { eager: true }) as Record<string, any>;
const apiMods = import.meta.glob(['../services/api.ts', '../services/api.local.ts'], { eager: true }) as Record<string, any>;

let cachedClient: SupabaseClient | null | undefined;
function getClient(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient;
  cachedClient = null;
  try {
    const m: any = Object.values(supaMods)[0];
    const c = m?.supabase ?? m?.default ?? (typeof m?.getSupabase === 'function' ? m.getSupabase() : null);
    if (c && typeof c.channel === 'function') cachedClient = c as SupabaseClient;
  } catch { /* ignore */ }
  if (!cachedClient) {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (url && key) {
      try { cachedClient = createClient(url, key, { realtime: { params: { eventsPerSecond: 20 } } }); } catch { /* ignore */ }
    }
  }
  return cachedClient;
}

interface Player { playerId: string; nickname: string; takia: TakiaId; asykSkin: AsykSkinId }

async function loadProfile(): Promise<{ nickname: string; takia: TakiaId; asykSkin: AsykSkinId; location: LocationId }> {
  const fallback = { nickname: 'Гость', takia: 'classic' as TakiaId, asykSkin: 'classic' as AsykSkinId, location: 'summer_yard' as LocationId };
  try {
    const m: any = apiMods['../services/api.ts'] ?? apiMods['../services/api.local.ts'];
    const p = await m?.api?.getProfile?.();
    if (p) return { nickname: p.nickname || fallback.nickname, takia: p.takia || 'classic', asykSkin: p.asykSkin || 'classic', location: p.location || 'summer_yard' };
  } catch { /* ignore */ }
  return fallback;
}

/* ───────────── Состояние ───────────── */

export const multiplayer: {
  active: boolean;
  roomCode: string | null;
  isHost: boolean;
  opponent: Player | null;
  leave(): void;
} = {
  active: false,
  roomCode: null,
  isHost: false,
  opponent: null,
  leave() { leaveRoom(true); closeModal(); },
};

const uid = 'p' + Math.random().toString(36).slice(2, 10);
let gameRef: Phaser.Game | null = null;
let ch: RealtimeChannel | null = null;
let me: Player = { playerId: uid, nickname: 'Гость', takia: 'classic', asykSkin: 'classic' };
let opp: Player | null = null;
let role: Role = 'host';
let myLocation: LocationId = 'summer_yard';
let lobbyDiff: Difficulty = 'medium';

let started = false;
let finished = false;
let turnNo = 0;
let thrower: Role = 'host';
let remoteLaunch = false; // ждём 'settled' от соперника
let remoteSim = false;    // локально идёт симуляция чужого броска — её 'throw:settled' игнорируем
let lastSettled: SettledMsg | null = null;
let lastThrow: ThrowMsg | null = null;
let retries = 0;
let waitTimer: any = null;
let guestTimer: any = null;
let rematchMine = false;
let rematchTheirs = false;
let lastFirst: Role | null = null;
let unloadBound = false;

const getGame = (): Phaser.Game | null => gameRef ?? ((window as any).__game as Phaser.Game) ?? null;
const scene = (): any => getGame()?.scene.getScene('GameScene') as any;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/* ───────────── Транспорт ───────────── */

async function send<K extends MsgName>(event: K, payload: ProtocolMap[K], critical = false): Promise<void> {
  const attempts = critical ? 3 : 1;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await ch?.send({ type: 'broadcast', event, payload });
      if (r === 'ok') return;
    } catch { /* retry */ }
    if (i < attempts - 1) await sleep(400);
  }
}

async function join(code: string, host: boolean, nick?: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  leaveRoom(false);
  const prof = await loadProfile();
  role = host ? 'host' : 'guest';
  myLocation = prof.location;
  me = { playerId: uid, nickname: (nick || prof.nickname).slice(0, 20), takia: prof.takia, asykSkin: prof.asykSkin };
  multiplayer.isHost = host;
  multiplayer.roomCode = code;
  lastFirst = null;

  return new Promise<boolean>((resolve) => {
    const channel = client.channel(`room:${code}`, {
      config: { broadcast: { self: false, ack: true }, presence: { key: me.playerId } },
    });
    ch = channel;
    channel.on('broadcast', { event: 'hello' }, ({ payload }) => onHello(payload as HelloMsg));
    channel.on('broadcast', { event: 'start' }, ({ payload }) => onStart(payload as StartMsg));
    channel.on('broadcast', { event: 'throw' }, ({ payload }) => onThrowMsg(payload as ThrowMsg));
    channel.on('broadcast', { event: 'settled' }, ({ payload }) => onSettledMsg(payload as SettledMsg));
    channel.on('broadcast', { event: 'resend' }, ({ payload }) => onResend(payload as TurnRef));
    channel.on('broadcast', { event: 'rematch' }, () => onRematch());
    channel.on('broadcast', { event: 'leave' }, () => onOpponentLeft());
    channel.on('presence', { event: 'sync' }, () => onSync());

    let done = false;
    const t = setTimeout(() => {
      if (!done) { done = true; leaveRoom(false); resolve(false); }
    }, 10000);

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        if (done) return;
        done = true;
        clearTimeout(t);
        multiplayer.active = true;
        bindBus();
        if (!unloadBound) {
          unloadBound = true;
          window.addEventListener('beforeunload', () => { if (multiplayer.active) void ch?.send({ type: 'broadcast', event: 'leave', payload: {} }); });
        }
        try { await channel.track({ ...me, joinedAt: Date.now() }); } catch { /* ignore */ }
        void send('hello', me as HelloMsg);
        if (!host) {
          guestTimer = setTimeout(() => {
            if (!opp && multiplayer.active) { toast('Комната не найдена или хозяин вышел'); leaveRoom(false); showMenu(); }
          }, 7000);
        }
        resolve(true);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        if (!done) { done = true; clearTimeout(t); leaveRoom(false); resolve(false); }
        else if (multiplayer.active) { toast('Связь потеряна'); const was = started; leaveRoom(false); closeModal(); if (was) goMenu(); }
      }
    });
  });
}

function leaveRoom(notifyPeer: boolean): void {
  clearTimeout(waitTimer);
  clearTimeout(guestTimer);
  unbindBus();
  const c = ch;
  ch = null;
  if (c) {
    const close = () => { try { void c.untrack(); getClient()?.removeChannel(c); } catch { /* ignore */ } };
    if (notifyPeer && multiplayer.active) {
      try { void c.send({ type: 'broadcast', event: 'leave', payload: {} }); } catch { /* ignore */ }
      setTimeout(close, 300);
    } else close();
  }
  multiplayer.active = false;
  multiplayer.roomCode = null;
  multiplayer.opponent = null;
  opp = null;
  started = false;
  finished = false;
  remoteLaunch = false;
  remoteSim = false;
  lastSettled = null;
  lastThrow = null;
  rematchMine = rematchTheirs = false;
  updateBadge();
}

/* ───────────── Presence / подключение ───────────── */

function onSync(): void {
  if (!ch) return;
  const st = ch.presenceState() as Record<string, any[]>;
  const all = Object.entries(st)
    .map(([key, v]) => ({ key, ...(v?.[0] || {}) }) as any)
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  const idx = all.findIndex((p) => p.key === me.playerId);
  if (idx >= 2) { toast('Комната занята'); leaveRoom(false); closeModal(); return; }
  const other = all.slice(0, 2).find((p) => p.key !== me.playerId);
  if (other && !opp) {
    opp = { playerId: other.key, nickname: String(other.nickname || 'Соперник'), takia: other.takia || 'classic', asykSkin: other.asykSkin || 'classic' };
    multiplayer.opponent = opp;
    clearTimeout(guestTimer);
    onOpponentJoined();
  } else if (!other && opp) {
    onOpponentLeft();
  }
}

function onHello(m: HelloMsg): void {
  if (!opp || !m || m.playerId !== opp.playerId) return;
  opp = { ...opp, nickname: m.nickname || opp.nickname, takia: m.takia, asykSkin: m.asykSkin };
  multiplayer.opponent = opp;
  updateBadge();
}

function onOpponentJoined(): void {
  setStatus(`Подключился: ${opp!.nickname}. Начинаем…`);
  if (multiplayer.isHost && !started) setTimeout(() => { if (opp && !started) startMatch(); }, 900);
}

function onOpponentLeft(): void {
  if (!multiplayer.active) return;
  if (!started && multiplayer.isHost) {
    opp = null;
    multiplayer.opponent = null;
    setStatus('Ждём друга…');
    return;
  }
  const wasStarted = started;
  toast('Соперник вышел');
  leaveRoom(false);
  closeModal();
  if (wasStarted) goMenu();
}

/* ───────────── Старт матча ───────────── */

function startMatch(): void {
  if (!multiplayer.isHost || !opp || !ch) return;
  const firstTurn: Role = lastFirst ? (lastFirst === 'host' ? 'guest' : 'host') : Math.random() < 0.5 ? 'host' : 'guest';
  lastFirst = firstTurn;
  const m: StartMsg = {
    difficulty: lobbyDiff,
    levelIndex: Math.floor(Math.random() * 3),
    location: myLocation,
    seed: Math.floor(Math.random() * 2147483647),
    firstTurn,
  };
  void send('start', m, true);
  runStart(m);
}

function onStart(m: StartMsg): void {
  if (multiplayer.isHost || !multiplayer.active || !m) return;
  runStart(m);
}

function runStart(m: StartMsg): void {
  clearTimeout(waitTimer);
  turnNo = 0;
  thrower = m.firstTurn;
  finished = false;
  remoteLaunch = false;
  remoteSim = false;
  lastSettled = null;
  lastThrow = null;
  retries = 0;
  rematchMine = rematchTheirs = false;
  started = true;
  closeModal();
  const g = getGame();
  if (!g) { toast('Игра не найдена (window.__game)'); return; }
  g.scene.getScenes(true).forEach((s) => { if (s.scene.key !== 'GameScene') g.scene.stop(s.scene.key); });
  g.scene.start('GameScene', {
    mode: 'online',
    difficulty: m.difficulty,
    levelIndex: m.levelIndex,
    location: m.location,
    seed: m.seed,
    myTurn: thrower === role,
  });
  updateBadge();
  setTimeout(() => scene()?.setMyTurn?.(thrower === role), 300);
}

/* ───────────── Игровая логика хода ───────────── */

function bindBus(): void {
  bus.on('throw:start', onThrowStart);
  bus.on('throw:settled', onSettled);
  bus.on('round:end', onRoundEnd);
}
function unbindBus(): void {
  bus.off('throw:start', onThrowStart);
  bus.off('throw:settled', onSettled);
  bus.off('round:end', onRoundEnd);
}

function advance(turnPassed: boolean): void {
  if (turnPassed) thrower = thrower === 'host' ? 'guest' : 'host';
  turnNo++;
  scene()?.setMyTurn?.(!finished && thrower === role);
  updateBadge();
}

/** Мой бросок (локальный ввод) → сообщаем сопернику. */
function onThrowStart(angle: number, power: number): void {
  if (!multiplayer.active || !started || finished) return;
  if (remoteLaunch) return; // это чужой бросок, запущенный по сети
  if (thrower !== role) return;
  remoteSim = false;
  lastThrow = { angle, power, turnNo };
  scene()?.setMyTurn?.(false);
  void send('throw', lastThrow, true);
}

/** Мой бросок остановился → шлём ИТОГОВОЕ состояние (авторитет — бросающий). */
function onSettled(states: BodyState[], scoreDelta: number, turnPassed: boolean): void {
  if (!multiplayer.active || !started || finished) return;
  if (remoteSim) { remoteSim = false; return; } // локальная симуляция чужого броска: итог придёт по сети
  if (remoteLaunch || thrower !== role) return;
  const tn = turnNo;
  scene()?.setMyTurn?.(false);
  setTimeout(() => {
    if (!multiplayer.active || tn !== turnNo) return;
    const sc = scene();
    const msg: SettledMsg = {
      snapshot: states,
      scoreDelta,
      turnPassed,
      turnNo: tn,
      scores: { me: sc?.scores?.me ?? 0, opponent: sc?.scores?.opponent ?? 0 },
    };
    lastSettled = msg;
    void send('settled', msg, true);
    advance(turnPassed);
    checkEnd(states);
  }, 0);
}

/** Чужой бросок: показываем анимацию. */
function onThrowMsg(m: ThrowMsg): void {
  if (!multiplayer.active || !started || finished || !m) return;
  if (m.turnNo !== turnNo || thrower === role || remoteLaunch) return; // устаревшее/повторное — игнор
  remoteLaunch = true;
  remoteSim = true;
  retries = 0;
  const sc = scene();
  sc?.setMyTurn?.(false);
  sc?.launch?.(m.angle, m.power);
  armWait();
}

function armWait(): void {
  clearTimeout(waitTimer);
  waitTimer = setTimeout(() => {
    if (!remoteLaunch || !multiplayer.active) return;
    retries++;
    if (retries > MAX_RESEND) {
      toast('Связь с соперником потеряна');
      leaveRoom(true);
      closeModal();
      goMenu();
      return;
    }
    void send('resend', { turnNo });
    armWait();
  }, SETTLED_TIMEOUT_MS);
}

/** Итог чужого броска: применяем snapshot бросающего → оба экрана одинаковы. */
function onSettledMsg(m: SettledMsg): void {
  if (!multiplayer.active || !started || finished || !m) return;
  if (m.turnNo !== turnNo || thrower === role) return; // устаревшее/повторное — игнор
  clearTimeout(waitTimer);
  retries = 0;
  const sc = scene();
  sc?.applySnapshot?.(m.snapshot, true);
  if (sc?.scores) {
    sc.scores.me = m.scores.opponent;
    sc.scores.opponent = m.scores.me;
  }
  remoteLaunch = false;
  advance(m.turnPassed);
  checkEnd(m.snapshot);
}

function onResend(m: TurnRef): void {
  if (!m) return;
  if (lastSettled && m.turnNo === lastSettled.turnNo) void send('settled', lastSettled);
  else if (lastThrow && m.turnNo === lastThrow.turnNo) void send('throw', lastThrow);
}

function onRoundEnd(): void {
  // запасной путь: основной — checkEnd по snapshot
  setTimeout(() => {
    if (multiplayer.active && started && !finished && !remoteLaunch) showResult();
  }, 800);
}

function checkEnd(snapshot: BodyState[]): void {
  const asyks = snapshot.filter((b) => /^asyk/i.test(b.id));
  if (asyks.length > 0 && asyks.every((b) => b.isOut)) setTimeout(() => showResult(), 500);
}

/* ───────────── Результат и реванш ───────────── */

function showResult(): void {
  if (finished || !multiplayer.active) return;
  finished = true;
  const sc = scene();
  sc?.setMyTurn?.(false);
  const a = Math.round((sc?.scores?.me ?? 0) * 10) / 10;
  const b = Math.round((sc?.scores?.opponent ?? 0) * 10) / 10;
  const title = a > b ? '🏆 Ты победил!' : a < b ? `Победил ${esc(opp?.nickname || 'соперник')}` : 'Ничья';
  render(
    `<h2 style="margin:0 0 8px">${title}</h2>
     <p style="font-size:18px">${esc(me.nickname)}: <b>${a}</b><br>${esc(opp?.nickname || 'Соперник')}: <b>${b}</b></p>
     <p id="mp-status" style="color:#8B8672;min-height:20px"></p>
     ${btn('rematch', 'Реванш')}${btn('menu', 'В меню', 'background:#274558;')}`,
    {
      rematch: () => {
        if (rematchMine) return;
        rematchMine = true;
        void send('rematch', {} as never, true);
        setStatus(rematchTheirs ? 'Начинаем…' : 'Ждём соперника…');
        maybeRematch();
      },
      menu: () => { multiplayer.leave(); goMenu(); },
    },
  );
}

function onRematch(): void {
  rematchTheirs = true;
  if (finished && !rematchMine) setStatus('Соперник хочет реванш!');
  maybeRematch();
}

function maybeRematch(): void {
  if (rematchMine && rematchTheirs && multiplayer.isHost) startMatch();
}

/* ───────────── Навигация ───────────── */

function goMenu(): void {
  const g = getGame();
  if (!g) return;
  g.scene.getScenes(true).forEach((s) => g.scene.stop(s.scene.key));
  const key = ['MenuScene', 'Menu', 'MainMenuScene', 'MainMenu', 'BootScene'].find((k) => (g.scene as any).keys?.[k]);
  if (key) g.scene.start(key);
}

/* ───────────── DOM-оверлеи ───────────── */

const OVERLAY = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(25,4,6,.78);z-index:9000;pointer-events:auto;font-family:system-ui,sans-serif;';
const CARD = 'background:#190406;color:#E0D5C1;border:2px solid #CB6325;border-radius:16px;padding:20px;width:min(92vw,380px);box-shadow:0 10px 40px #000;text-align:center;';
const BTN = 'background:#85150F;color:#E0D5C1;border:0;border-radius:10px;padding:12px 16px;margin:6px 4px;font-size:16px;cursor:pointer;';
const INPUT = 'background:#21263A;color:#E0D5C1;border:1px solid #8B8672;border-radius:8px;padding:10px;font-size:16px;width:70%;text-align:center;';

const btn = (act: string, label: string, extra = '') => `<button data-act="${act}" style="${BTN}${extra}">${label}</button>`;

function render(html: string, acts: Record<string, () => void> = {}): HTMLElement {
  let m = document.getElementById('saka-mp-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'saka-mp-modal';
    m.setAttribute('style', OVERLAY);
    (document.getElementById('ui-root') || document.body).appendChild(m);
  }
  m.innerHTML = `<div style="${CARD}">${html}</div>`;
  m.querySelectorAll<HTMLElement>('[data-act]').forEach((el) => {
    el.onclick = () => acts[el.dataset.act as string]?.();
  });
  return m;
}
function closeModal(): void { document.getElementById('saka-mp-modal')?.remove(); }
function setStatus(text: string): void {
  const el = document.getElementById('mp-status');
  if (el) el.textContent = text;
}

function updateBadge(): void {
  let el = document.getElementById('saka-mp-badge');
  if (!multiplayer.active || !started || !opp) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'saka-mp-badge';
    el.setAttribute('style', 'position:fixed;top:8px;left:50%;transform:translateX(-50%);background:rgba(25,4,6,.8);color:#E0D5C1;border:1px solid #CB6325;border-radius:999px;padding:4px 14px;font:14px system-ui,sans-serif;z-index:8000;pointer-events:none;');
    document.body.appendChild(el);
  }
  el.textContent = `Соперник: ${opp.nickname} · ${thrower === role ? 'твой ход' : 'ход соперника'}`;
}

function unavailable(): void {
  render(
    `<h3 style="margin-top:0">Онлайн недоступен</h3>
     <p>Не настроен Supabase. Добавьте <b>VITE_SUPABASE_URL</b> и <b>VITE_SUPABASE_ANON_KEY</b> в файл .env (или в переменные окружения Vercel) и перезапустите.</p>
     <p style="color:#8B8672">Одиночная игра и игра вдвоём на одном экране работают без этого.</p>
     ${btn('close', 'Закрыть')}`,
    { close: closeModal },
  );
}

function showMenu(): void {
  render(
    `<h3 style="margin-top:0">Онлайн-матч</h3>
     <p>Сложность: <select id="mp-diff" style="${INPUT}width:auto;">
       <option value="easy">easy</option><option value="medium" selected>medium</option><option value="hard">hard</option></select></p>
     ${btn('create', 'Создать матч')}
     <hr style="border:0;border-top:1px solid #8B8672;margin:12px 0">
     <input id="mp-code" inputmode="numeric" maxlength="5" placeholder="Код (5 цифр)" style="${INPUT}"><br>
     ${btn('join', 'Войти по коду')}<br>
     ${btn('close', 'Закрыть', 'background:#274558;')}`,
    {
      create: () => { lobbyDiff = ((document.getElementById('mp-diff') as HTMLSelectElement).value as Difficulty) || 'medium'; void hostCreate(); },
      join: () => {
        const c = (document.getElementById('mp-code') as HTMLInputElement).value.trim();
        if (!/^\d{5}$/.test(c)) { toast('Код состоит из 5 цифр'); return; }
        void joinAsGuest(c);
      },
      close: () => { if (!started) leaveRoom(true); closeModal(); },
    },
  );
}

async function hostCreate(): Promise<void> {
  const code = String(Math.floor(10000 + Math.random() * 90000));
  render('<p>Создаём комнату…</p>');
  const ok = await join(code, true);
  if (!ok) { toast('Не удалось подключиться к серверу'); showMenu(); return; }
  const link = `${location.origin}/?room=${code}`;
  render(
    `<h3 style="margin-top:0">Матч создан</h3>
     <p>Код: <b style="font-size:28px;letter-spacing:4px;color:#EDB57C">${code}</b></p>
     <p style="word-break:break-all;font-size:13px;color:#8B8672">${link}</p>
     ${btn('copy', 'Скопировать ссылку')}
     <p id="mp-status" style="min-height:22px">Ждём друга…</p>
     ${btn('close', 'Отмена', 'background:#274558;')}`,
    {
      copy: async () => {
        try { await navigator.clipboard.writeText(link); toast('Ссылка скопирована'); }
        catch { window.prompt('Скопируйте ссылку:', link); }
      },
      close: () => { leaveRoom(true); closeModal(); },
    },
  );
  if (opp) setStatus(`Подключился: ${opp.nickname}. Начинаем…`);
}

async function joinAsGuest(code: string, nick?: string): Promise<void> {
  render('<p>Подключаемся…</p><p id="mp-status"></p>');
  const ok = await join(code, false, nick);
  if (!ok) { toast('Не удалось подключиться к серверу'); showMenu(); return; }
  render(
    `<h3 style="margin-top:0">Комната ${code}</h3><p id="mp-status">Ищем хозяина комнаты…</p>${btn('close', 'Отмена', 'background:#274558;')}`,
    { close: () => { leaveRoom(true); closeModal(); } },
  );
  if (opp) setStatus(`Подключился: ${opp.nickname}. Начинаем…`);
}

/* ───────────── Публичный API ───────────── */

export function openLobby(game?: Phaser.Game): void {
  if (game) gameRef = game;
  if (!getClient()) { unavailable(); return; }
  showMenu();
}

export function checkRoomFromUrl(game?: Phaser.Game): void {
  if (game) gameRef = game;
  const code = new URLSearchParams(location.search).get('room');
  if (!code || !/^\d{5}$/.test(code)) return;
  history.replaceState({}, '', location.pathname);
  if (!getClient()) { unavailable(); return; }
  loadProfile().then((p) => {
    render(
      `<div style="font-size:42px">🎯</div>
       <h2 style="margin:6px 0">Тебя пригласили сыграть в Сақа</h2>
       <p style="color:#8B8672">Асық ату онлайн: по очереди выбивайте асыки из круга. Комната <b style="color:#EDB57C">${code}</b>. Регистрация не нужна.</p>
       <input id="mp-nick" maxlength="20" value="${esc(p.nickname)}" style="${INPUT}"><br>
       ${btn('go', 'Принять вызов')}${btn('no', 'Не сейчас', 'background:#274558;')}`,
      {
        go: () => {
          const nick = (document.getElementById('mp-nick') as HTMLInputElement)?.value.trim() || p.nickname;
          void joinAsGuest(code, nick);
        },
        no: closeModal,
      },
    );
  });
}