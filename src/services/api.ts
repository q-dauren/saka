import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type {
  AsykSkinId, Difficulty, LocationId, PlayStatus, Profile, RoundResult, TakiaId,
} from '../types';

export interface Api {
  init(): Promise<void>;
  getUser(): Promise<{ id: string; email: string } | null>;
  signUp(email: string, password: string, nickname: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signInGoogle(): Promise<void>;
  signOut(): Promise<void>;
  getProfile(): Promise<Profile>;
  updateProfile(patch: Partial<Omit<Profile, 'id' | 'isPro'>>): Promise<Profile>;
  saveResult(r: RoundResult): Promise<void>;
  getBest(): Promise<Record<string, number>>;
  getHistory(limit?: number): Promise<RoundResult[]>;
  getInventory(): Promise<string[]>;
  purchase(itemId: string): Promise<void>;
  setPro(active: boolean): Promise<void>;
  getPlayStatus(): Promise<PlayStatus>;
  reportPlaySeconds(seconds: number): Promise<PlayStatus>;
}

// ---------- константы и доступность ----------
const K = {
  profile: 'saka.guest.profile',
  best: 'saka.guest.best',
  history: 'saka.guest.history',
  inv: 'saka.guest.inventory',
  play: 'saka.guest.play',
  pro: 'saka.guest.pro',
};
const PLAY_BUDGET = 600;
const LOCK_SEC = 900;
const MAX_TICK = 30;
const SHOP_ITEMS = ['skin:silver', 'skin:gold', 'skin:ornament', 'skin:glow', 'takia:festive', 'takia:gold', 'takia:modern'];
const SKIN_IDS: AsykSkinId[] = ['classic', 'silver', 'gold', 'ornament', 'glow'];
const TAKIA_IDS: TakiaId[] = ['classic', 'festive', 'gold', 'modern'];
const LOC_IDS: LocationId[] = ['summer_yard', 'jailau', 'night_almaty', 'winter_yard'];

export function canUseSkin(id: AsykSkinId, inv: string[], pro: boolean): boolean {
  return id === 'classic' || id === 'silver' || pro || inv.includes('skin:' + id);
}
export function canUseTakia(id: TakiaId, inv: string[], pro: boolean): boolean {
  return id === 'classic' || pro || inv.includes('takia:' + id);
}

// ---------- утилиты ----------
function read<T>(k: string, def: T): T {
  try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : def; } catch { return def; }
}
function write(k: string, v: unknown): void {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* квота/приватный режим */ }
}
function ru(e: unknown, fallback: string): Error {
  const raw = String((e as any)?.message ?? e ?? '');
  if (/[А-Яа-яЁё]/.test(raw)) return new Error(raw);
  const m = raw.toLowerCase();
  const map: [RegExp, string][] = [
    [/invalid login/, 'Неверная почта или пароль'],
    [/already registered|already been registered/, 'Эта почта уже зарегистрирована'],
    [/password should be|at least 6|weak password/, 'Пароль слишком короткий: минимум 6 символов'],
    [/email not confirmed/, 'Почта не подтверждена. Проверьте письмо'],
    [/rate limit|too many|over_email/, 'Слишком много попыток, подождите минуту'],
    [/invalid email|unable to validate email/, 'Некорректный email'],
    [/fetch|network|failed to load|timeout/, 'Нет связи с сервером. Проверьте интернет'],
    [/row-level security|permission denied/, 'Нет доступа к данным'],
    [/provider is not enabled|unsupported provider/, 'Вход через Google не включён'],
  ];
  for (const [re, t] of map) if (re.test(m)) return new Error(t);
  return new Error(fallback);
}
async function call<T>(fallback: string, fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) { throw ru(e, fallback); }
}
function ok<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data as T;
}
function need(): SupabaseClient {
  if (!supabase) throw new Error('Сервер не настроен: играйте как гость');
  return supabase;
}

async function getUser(): Promise<{ id: string; email: string } | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const u = data.session?.user;
    return u ? { id: u.id, email: u.email ?? '' } : null;
  } catch { return null; }
}
async function uid(): Promise<string | null> { return (await getUser())?.id ?? null; }

// ---------- маппинг ----------
function toProfile(r: any): Profile {
  return {
    id: r.id, nickname: r.nickname, takia: r.takia, asykSkin: r.asyk_skin,
    location: r.location, isPro: !!r.is_pro, tutorialDone: !!r.tutorial_done,
  };
}
function toResult(r: any): RoundResult {
  return {
    mode: r.mode, difficulty: r.difficulty, levelIndex: r.level_index, location: r.location,
    score: r.score, stars: r.stars, throwsUsed: r.throws_used, asykOut: r.asyk_out,
    asykTotal: r.asyk_total, won: !!r.won, durationSec: r.duration_sec, finishedAt: r.finished_at,
  };
}
function toRow(userId: string, r: RoundResult) {
  return {
    user_id: userId, mode: r.mode, difficulty: r.difficulty, level_index: r.levelIndex,
    location: r.location, score: Math.round(r.score), stars: r.stars, throws_used: r.throwsUsed,
    asyk_out: r.asykOut, asyk_total: r.asykTotal, won: r.won,
    duration_sec: Math.round(r.durationSec), finished_at: r.finishedAt,
  };
}
function toPlay(j: any): PlayStatus {
  return {
    locked: !!j?.locked, secondsLeft: Number(j?.secondsLeft) || 0,
    lockedUntil: j?.lockedUntil ?? null, isPro: !!j?.isPro,
  };
}

// ---------- гость ----------
function guestProfile(): Profile {
  const p = read<Partial<Profile>>(K.profile, {});
  return {
    id: 'guest', nickname: p.nickname || 'Гость', takia: p.takia ?? 'classic',
    asykSkin: p.asykSkin ?? 'classic', location: p.location ?? 'summer_yard',
    isPro: read<boolean>(K.pro, false), tutorialDone: !!p.tutorialDone,
  };
}
function guestPlay(sub: number): PlayStatus {
  const pro = read<boolean>(K.pro, false);
  const st = read<{ left: number; until: number | null }>(K.play, { left: PLAY_BUDGET, until: null });
  const now = Date.now();
  if (pro) return { locked: false, secondsLeft: st.left, lockedUntil: null, isPro: true };
  if (st.until !== null && st.until <= now) { st.left = PLAY_BUDGET; st.until = null; }
  if (st.until === null && sub > 0) {
    st.left = Math.max(0, st.left - Math.min(sub, MAX_TICK));
    if (st.left === 0) st.until = now + LOCK_SEC * 1000;
  }
  write(K.play, st);
  const locked = st.until !== null && st.until > now;
  return {
    locked,
    secondsLeft: locked ? Math.ceil((st.until! - now) / 1000) : st.left,
    lockedUntil: locked ? new Date(st.until!).toISOString() : null,
    isPro: false,
  };
}

// ---------- перенос гостевых данных ----------
let migrating: Promise<void> | null = null;
function migrateGuest(userId: string): Promise<void> {
  if (migrating) return migrating;
  migrating = doMigrate(userId).finally(() => { migrating = null; });
  return migrating;
}
async function doMigrate(userId: string): Promise<void> {
  if (!supabase) return;
  const hist = read<RoundResult[]>(K.history, []);
  const best = read<Record<string, number>>(K.best, {});
  const inv = read<string[]>(K.inv, []);
  if (!hist.length && !Object.keys(best).length && !inv.length) return;

  const rows = hist.map((r) => toRow(userId, r));
  const maxByKey: Record<string, number> = {};
  for (const r of hist) {
    const k = `${r.difficulty}:${r.levelIndex}`;
    maxByKey[k] = Math.max(maxByKey[k] ?? -Infinity, r.score);
  }
  for (const [k, v] of Object.entries(best)) {
    if ((maxByKey[k] ?? -Infinity) < v) {
      const [d, l] = k.split(':');
      rows.push(toRow(userId, {
        mode: 'solo', difficulty: d as Difficulty, levelIndex: Number(l), location: 'summer_yard',
        score: v, stars: 0, throwsUsed: 0, asykOut: 0, asykTotal: 0, won: false, durationSec: 0,
        finishedAt: new Date().toISOString(),
      }));
    }
  }
  if (rows.length) {
    const { error } = await supabase.from('results').insert(rows);
    if (error) throw error;
  }
  for (const it of inv) { try { await supabase.rpc('purchase_item', { item: it }); } catch { /* ignore */ } }

  const gp = read<Partial<Profile>>(K.profile, {});
  const patch: Record<string, unknown> = {};
  if (gp.location && LOC_IDS.includes(gp.location)) patch.location = gp.location;
  if (gp.tutorialDone) patch.tutorial_done = true;
  if (Object.keys(patch).length) await supabase.from('profiles').update(patch).eq('id', userId);

  [K.history, K.best, K.inv, K.profile].forEach((k) => { try { localStorage.removeItem(k); } catch { /* */ } });
}

// ---------- методы ----------
let subscribed = false;
async function init(): Promise<void> {
  if (!supabase) return;
  const u = await uid();
  if (u) { try { await migrateGuest(u); } catch { /* повторим при следующем входе */ } }
  if (!subscribed) {
    subscribed = true;
    supabase.auth.onAuthStateChange((ev, s) => {
      if (ev === 'SIGNED_IN' && s?.user) {
        const id = s.user.id;
        setTimeout(() => { void migrateGuest(id).catch(() => {}); }, 0);
      }
    });
  }
}

async function signUp(email: string, password: string, nickname: string): Promise<void> {
  const sb = need();
  nickname = nickname.trim();
  if (nickname.length < 2 || nickname.length > 20) throw new Error('Ник: от 2 до 20 символов');
  await call('Не удалось зарегистрироваться', async () => {
    const r = await sb.auth.signUp({ email: email.trim(), password, options: { data: { nickname } } });
    if (r.error) throw r.error;
    if (!r.data.session) throw new Error('Почта ещё не подтверждена. Подтвердите письмо или отключите «Confirm email» в Supabase');
    await migrateGuest(r.data.user!.id).catch(() => {});
  });
}
async function signIn(email: string, password: string): Promise<void> {
  const sb = need();
  await call('Не удалось войти', async () => {
    const r = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (r.error) throw r.error;
    await migrateGuest(r.data.user.id).catch(() => {});
  });
}
async function signInGoogle(): Promise<void> {
  const sb = need();
  await call('Не удалось войти через Google', async () => {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: location.origin + location.pathname },
    });
    if (error) throw error;
  });
}
async function signOut(): Promise<void> {
  if (!supabase) return;
  await call('Не удалось выйти', async () => { const { error } = await supabase!.auth.signOut(); if (error) throw error; });
}

async function getInventory(): Promise<string[]> {
  const u = await uid();
  if (!u) return read<string[]>(K.inv, []);
  return call('Не удалось загрузить покупки', async () => {
    const rows = ok<any[]>(await need().from('purchases').select('item_id'));
    return rows.map((r) => r.item_id as string);
  });
}

/** Если предмет больше недоступен (Pro отключили) — откатываем на classic. */
async function sanitize(p: Profile): Promise<Profile> {
  const freeOnly = (p.asykSkin === 'classic' || p.asykSkin === 'silver') && p.takia === 'classic';
  if (p.isPro || freeOnly) return p;
  const inv = await getInventory();
  const fix: Partial<Profile> = {};
  if (!canUseSkin(p.asykSkin, inv, p.isPro)) fix.asykSkin = 'classic';
  if (!canUseTakia(p.takia, inv, p.isPro)) fix.takia = 'classic';
  if (!Object.keys(fix).length) return p;
  const np = { ...p, ...fix };
  if (p.id === 'guest') write(K.profile, np);
  else { try { await need().from('profiles').update({ asyk_skin: np.asykSkin, takia: np.takia }).eq('id', p.id); } catch { /* */ } }
  return np;
}

async function getProfile(): Promise<Profile> {
  const u = await uid();
  if (!u) return sanitize(guestProfile());
  return call('Не удалось загрузить профиль', async () => {
    const sb = need();
    let res = await sb.from('profiles').select('*').eq('id', u).maybeSingle();
    if (res.error) throw res.error;
    if (!res.data) {
      const user = await getUser();
      let nick = (user?.email ?? '').split('@')[0].slice(0, 20);
      if (nick.length < 2) nick = 'Игрок';
      await sb.from('profiles').insert({ id: u, nickname: nick });
      res = await sb.from('profiles').select('*').eq('id', u).single();
      if (res.error) throw res.error;
    }
    return sanitize(toProfile(res.data));
  });
}

async function updateProfile(patch: Partial<Omit<Profile, 'id' | 'isPro'>>): Promise<Profile> {
  if (patch.nickname !== undefined) {
    const n = patch.nickname.trim();
    if (n.length < 2 || n.length > 20) throw new Error('Ник: от 2 до 20 символов');
    patch = { ...patch, nickname: n };
  }
  if (patch.location !== undefined && !LOC_IDS.includes(patch.location)) throw new Error('Неизвестная локация');
  if (patch.asykSkin !== undefined && !SKIN_IDS.includes(patch.asykSkin)) throw new Error('Неизвестный скин');
  if (patch.takia !== undefined && !TAKIA_IDS.includes(patch.takia)) throw new Error('Неизвестная тақия');

  if (patch.asykSkin !== undefined || patch.takia !== undefined) {
    const [cur, inv] = await Promise.all([getProfile(), getInventory()]);
    if (patch.asykSkin !== undefined && !canUseSkin(patch.asykSkin, inv, cur.isPro)) throw new Error('Этот скин ещё не куплен');
    if (patch.takia !== undefined && !canUseTakia(patch.takia, inv, cur.isPro)) throw new Error('Эта тақия ещё не куплена');
  }
  const u = await uid();
  if (!u) {
    const p = { ...guestProfile(), ...patch };
    write(K.profile, p);
    return p;
  }
  return call('Не удалось сохранить профиль', async () => {
    const row: Record<string, unknown> = {};
    if (patch.nickname !== undefined) row.nickname = patch.nickname;
    if (patch.takia !== undefined) row.takia = patch.takia;
    if (patch.asykSkin !== undefined) row.asyk_skin = patch.asykSkin;
    if (patch.location !== undefined) row.location = patch.location;
    if (patch.tutorialDone !== undefined) row.tutorial_done = patch.tutorialDone;
    if (!Object.keys(row).length) return getProfile();
    const res = await need().from('profiles').update(row).eq('id', u).select().single();
    return toProfile(ok(res));
  });
}

async function saveResult(r: RoundResult): Promise<void> {
  const u = await uid();
  if (!u) {
    const hist = read<RoundResult[]>(K.history, []);
    hist.unshift(r);
    write(K.history, hist.slice(0, 100));
    const best = read<Record<string, number>>(K.best, {});
    const key = `${r.difficulty}:${r.levelIndex}`;
    if (best[key] === undefined || r.score > best[key]) best[key] = r.score;
    write(K.best, best);
    return;
  }
  await call('Не удалось сохранить результат', async () => {
    const { error } = await need().from('results').insert(toRow(u, r));
    if (error) throw error;
  });
}

async function getBest(): Promise<Record<string, number>> {
  const u = await uid();
  if (!u) return read<Record<string, number>>(K.best, {});
  return call('Не удалось загрузить рекорды', async () => {
    const rows = ok<any[]>(await need().from('best_results').select('difficulty,level_index,best').eq('user_id', u));
    const out: Record<string, number> = {};
    for (const r of rows) out[`${r.difficulty}:${r.level_index}`] = r.best;
    return out;
  });
}

async function getHistory(limit = 30): Promise<RoundResult[]> {
  const n = Math.min(Math.max(Math.floor(limit) || 30, 1), 500);
  const u = await uid();
  if (!u) return read<RoundResult[]>(K.history, []).slice(0, n);
  return call('Не удалось загрузить историю', async () => {
    const rows = ok<any[]>(await need().from('results').select('*').eq('user_id', u)
      .order('finished_at', { ascending: false }).limit(n));
    return rows.map(toResult);
  });
}

async function purchase(itemId: string): Promise<void> {
  if (!SHOP_ITEMS.includes(itemId)) throw new Error('Неизвестный предмет');
  const u = await uid();
  if (!u) {
    const inv = read<string[]>(K.inv, []);
    if (!inv.includes(itemId)) { inv.push(itemId); write(K.inv, inv); }
    return;
  }
  await call('Не удалось купить предмет', async () => {
    const { error } = await need().rpc('purchase_item', { item: itemId });
    if (error) throw error;
  });
}

async function setPro(active: boolean): Promise<void> {
  const u = await uid();
  if (!u) { write(K.pro, !!active); return; }
  await call('Не удалось изменить подписку', async () => {
    const { error } = await need().rpc('set_pro', { active });
    if (error) throw error;
  });
}

async function getPlayStatus(): Promise<PlayStatus> {
  const u = await uid();
  if (!u) return guestPlay(0);
  return call('Не удалось проверить игровое время', async () => {
    const { data, error } = await need().rpc('get_play_status');
    if (error) throw error;
    return toPlay(data);
  });
}

async function reportPlaySeconds(seconds: number): Promise<PlayStatus> {
  const s = Math.min(Math.max(Math.floor(seconds) || 0, 0), MAX_TICK);
  const u = await uid();
  if (!u) return guestPlay(s);
  return call('Не удалось обновить игровое время', async () => {
    const { data, error } = await need().rpc('report_play_seconds', { seconds: s });
    if (error) throw error;
    return toPlay(data);
  });
}

export const api: Api = {
  init, getUser, signUp, signIn, signInGoogle, signOut, getProfile, updateProfile,
  saveResult, getBest, getHistory, getInventory, purchase, setPro, getPlayStatus, reportPlaySeconds,
};
