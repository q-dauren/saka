### supabase/schema.sql
```sql
-- ============================================================================
-- Сақа: схема Supabase. Вставить целиком в SQL Editor и нажать Run (можно запускать повторно).
--
-- ВАЖНО, чтобы регистрация работала мгновенно (без письма с подтверждением):
--   Supabase → Authentication → Providers → Email → выключить «Confirm email» → Save.
-- ============================================================================

-- ---------- Таблицы ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default 'Игрок' check (char_length(nickname) between 2 and 20),
  takia text not null default 'classic' check (takia in ('classic','festive','gold','modern')),
  asyk_skin text not null default 'classic' check (asyk_skin in ('classic','silver','gold','ornament','glow')),
  location text not null default 'summer_yard' check (location in ('summer_yard','jailau','night_almaty','winter_yard')),
  is_pro boolean not null default false,
  tutorial_done boolean not null default false,
  play_seconds_left int not null default 600,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('solo','local2','online')),
  difficulty text not null check (difficulty in ('easy','medium','hard')),
  level_index int not null check (level_index between 0 and 2),
  location text not null,
  score int not null,
  stars int not null default 0 check (stars between 0 and 3),
  throws_used int not null default 0,
  asyk_out int not null default 0,
  asyk_total int not null default 0,
  won boolean not null default false,
  duration_sec int not null default 0,
  finished_at timestamptz not null default now()
);
create index if not exists results_user_finished_idx on public.results (user_id, finished_at desc);
create index if not exists results_user_level_idx on public.results (user_id, difficulty, level_index);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, item_id)
);

-- ---------- Профиль при регистрации ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare nick text;
begin
  nick := left(trim(coalesce(
    nullif(new.raw_user_meta_data->>'nickname',''),
    nullif(new.raw_user_meta_data->>'full_name',''),
    split_part(coalesce(new.email,''),'@',1))), 20);
  if nick is null or char_length(nick) < 2 then nick := 'Игрок'; end if;
  insert into public.profiles (id, nickname) values (new.id, nick) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Защита: скин/тақия только купленные или Pro ----------
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.asyk_skin is distinct from old.asyk_skin and new.asyk_skin in ('gold','ornament','glow')
     and not new.is_pro
     and not exists (select 1 from public.purchases where user_id = new.id and item_id = 'skin:' || new.asyk_skin) then
    raise exception 'Этот скин ещё не куплен';
  end if;
  if new.takia is distinct from old.takia and new.takia <> 'classic'
     and not new.is_pro
     and not exists (select 1 from public.purchases where user_id = new.id and item_id = 'takia:' || new.takia) then
    raise exception 'Эта тақия ещё не куплена';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_trg on public.profiles;
create trigger profiles_guard_trg before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------- RLS ----------
alter table public.profiles  enable row level security;
alter table public.results   enable row level security;
alter table public.purchases enable row level security;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_insert_own on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists results_select_own on public.results;
drop policy if exists results_insert_own on public.results;
create policy results_select_own on public.results for select to authenticated using (user_id = auth.uid());
create policy results_insert_own on public.results for insert to authenticated with check (user_id = auth.uid());

drop policy if exists purchases_select_own on public.purchases;
create policy purchases_select_own on public.purchases for select to authenticated using (user_id = auth.uid());
-- INSERT в purchases политики нет: только через RPC purchase_item.

-- Права на колонки: is_pro, play_seconds_left, locked_until напрямую менять нельзя.
revoke all on public.profiles  from anon, authenticated;
revoke all on public.results   from anon, authenticated;
revoke all on public.purchases from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id, nickname) on public.profiles to authenticated;
grant update (nickname, takia, asyk_skin, location, tutorial_done) on public.profiles to authenticated;
grant select, insert on public.results to authenticated;
grant select on public.purchases to authenticated;

-- ---------- Лучшие результаты ----------
create or replace view public.best_results with (security_invoker = true) as
  select user_id, difficulty, level_index, max(score) as best
  from public.results
  group by user_id, difficulty, level_index;
revoke all on public.best_results from anon;
grant select on public.best_results to authenticated;

-- ---------- RPC: Pro ----------
create or replace function public.set_pro(active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Нужно войти в аккаунт'; end if;
  update public.profiles set is_pro = active where id = auth.uid();
end $$;

-- ---------- RPC: покупка (тестовая) ----------
create or replace function public.purchase_item(item text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Нужно войти в аккаунт'; end if;
  if item not in ('skin:gold','skin:ornament','skin:glow','skin:silver','takia:festive','takia:gold','takia:modern') then
    raise exception 'Неизвестный предмет';
  end if;
  insert into public.purchases (user_id, item_id) values (auth.uid(), item)
    on conflict (user_id, item_id) do nothing;
end $$;

-- ---------- RPC: лимит времени ----------
create or replace function public._play_tick(sub int) returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  p public.profiles%rowtype;
  locked boolean;
  left_s int;
begin
  if uid is null then raise exception 'Нужно войти в аккаунт'; end if;
  select * into p from public.profiles where id = uid for update;
  if not found then raise exception 'Профиль не найден'; end if;
  if p.is_pro then
    return json_build_object('locked', false, 'secondsLeft', p.play_seconds_left, 'lockedUntil', null, 'isPro', true);
  end if;
  if p.locked_until is not null and p.locked_until <= now() then
    p.play_seconds_left := 600; p.locked_until := null;
  end if;
  if p.locked_until is null and sub > 0 then
    p.play_seconds_left := greatest(0, p.play_seconds_left - least(sub, 30));
    if p.play_seconds_left = 0 then p.locked_until := now() + interval '15 minutes'; end if;
  end if;
  update public.profiles set play_seconds_left = p.play_seconds_left, locked_until = p.locked_until where id = uid;
  locked := p.locked_until is not null and p.locked_until > now();
  left_s := case when locked then ceil(extract(epoch from (p.locked_until - now())))::int else p.play_seconds_left end;
  return json_build_object('locked', locked, 'secondsLeft', left_s,
                           'lockedUntil', case when locked then p.locked_until else null end, 'isPro', false);
end $$;

create or replace function public.get_play_status() returns json
language sql security definer set search_path = public as $$ select public._play_tick(0) $$;

create or replace function public.report_play_seconds(seconds int) returns json
language sql security definer set search_path = public as $$ select public._play_tick(seconds) $$;

-- ---------- RPC: таблица лидеров (топ-10 по сумме лучших очков) ----------
create or replace function public.leaderboard() returns table (nickname text, total bigint)
language sql stable security definer set search_path = public as $$
  select p.nickname, sum(b.best)::bigint as total
  from (select user_id, max(score) as best from public.results group by user_id, difficulty, level_index) b
  join public.profiles p on p.id = b.user_id
  group by p.id, p.nickname
  order by total desc
  limit 10
$$;

-- ---------- Права на функции ----------
revoke all on function public._play_tick(int) from public, anon, authenticated;
revoke all on function public.set_pro(boolean) from public, anon;
revoke all on function public.purchase_item(text) from public, anon;
revoke all on function public.get_play_status() from public, anon;
revoke all on function public.report_play_seconds(int) from public, anon;
grant execute on function public.set_pro(boolean) to authenticated;
grant execute on function public.purchase_item(text) to authenticated;
grant execute on function public.get_play_status() to authenticated;
grant execute on function public.report_play_seconds(int) to authenticated;
grant execute on function public.leaderboard() to anon, authenticated;
```

### .env.example
```
# Supabase (Project Settings → API)
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-public-key
```

### src/services/supabase.ts
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const env = ((import.meta as any).env ?? {}) as Record<string, string | undefined>;
const url = env.VITE_SUPABASE_URL?.trim();
const key = env.VITE_SUPABASE_ANON_KEY?.trim();

function make(): SupabaseClient | null {
  if (!url || !key) return null;
  try {
    return createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  } catch (e) {
    console.warn('Supabase не инициализирован, работаем как гость', e);
    return null;
  }
}

/** null = переменные окружения не заданы: игра работает в гостевом режиме (localStorage). */
export const supabase: SupabaseClient | null = make();
export const hasSupabase = supabase !== null;
```

### src/services/api.ts
```ts
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
```

### src/ui/styles.ts
```ts
const CSS = `
#ui-root{pointer-events:none}
#ui-root *{box-sizing:border-box}
.sk-overlay,.sk-lock{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:10px;pointer-events:auto;color:#E0D5C1;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:15px;line-height:1.35}
.sk-overlay{z-index:1100;background:rgba(25,4,6,.8);animation:sk-fade .2s ease}
.sk-overlay.sk-out{opacity:0;transition:opacity .18s}
.sk-card{width:100%;max-width:540px;max-height:94vh;max-height:94dvh;overflow:auto;background:#190406;border:2px solid #85150F;border-radius:16px;box-shadow:0 14px 44px rgba(0,0,0,.6);animation:sk-pop .25s ease}
.sk-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#85150F;color:#E0D5C1}
.sk-title{margin:0;font-size:19px;letter-spacing:.3px}
.sk-x{border:0;background:rgba(0,0,0,.25);color:#E0D5C1;width:36px;height:36px;border-radius:50%;font-size:18px;cursor:pointer}
.sk-test{margin:10px 14px 0;padding:6px 10px;border:1px dashed #CB6325;border-radius:8px;background:rgba(203,99,37,.15);color:#EDB57C;font-weight:700;font-size:12px;text-align:center;letter-spacing:.4px}
.sk-body{padding:14px}
.sk-tabs{display:flex;gap:6px;margin-bottom:12px}
.sk-tab{flex:1;padding:10px 6px;border:1px solid #8B8672;background:transparent;color:#E0D5C1;border-radius:10px;font-size:14px;cursor:pointer}
.sk-tab.on{background:#CB6325;border-color:#CB6325;color:#190406;font-weight:700}
.sk-btn{display:inline-block;padding:11px 16px;border:0;border-radius:10px;background:#CB6325;color:#190406;font-weight:700;font-size:15px;cursor:pointer;min-height:44px}
.sk-btn.alt{background:transparent;border:1px solid #8B8672;color:#E0D5C1;font-weight:500}
.sk-btn.wide{width:100%;margin-top:8px}
.sk-btn:disabled{opacity:.5;cursor:default}
.sk-input{width:100%;padding:12px;margin-bottom:8px;border:1px solid #8B8672;border-radius:10px;background:#21263A;color:#E0D5C1;font-size:16px}
.sk-input::placeholder{color:#8B8672}
.sk-err{min-height:18px;margin:2px 0 6px;color:#E5805B;font-size:13px}
.sk-muted{color:#8B8672;font-size:13px;margin:4px 0}
.sk-sec{margin-bottom:16px}
.sk-h3{margin:0 0 8px;font-size:15px;color:#EDB57C}
.sk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px}
.sk-tile{position:relative;padding:8px 4px;border:2px solid #2a1518;border-radius:12px;background:#21263A;color:#E0D5C1;cursor:pointer;text-align:center;font-size:13px}
.sk-tile.on{border-color:#CB6325;background:#3a2418}
.sk-tile.lock{opacity:.7}
.sk-pv{display:flex;justify-content:center;align-items:center;height:64px}
.sk-tname{margin-top:4px}
.sk-lockicon{position:absolute;top:4px;right:6px;font-size:14px}
.sk-loc{width:100%;height:44px;border-radius:8px}
.sk-row{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:10px}
.sk-list{display:flex;flex-direction:column;gap:6px}
.sk-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;border-radius:10px;background:#21263A;font-size:14px}
.sk-item .w{color:#8DA750}.sk-item .l{color:#E5805B}
.sk-star{color:#EDB57C;letter-spacing:1px}
.sk-shop{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}
.sk-prod{padding:10px;border-radius:12px;background:#21263A;text-align:center;display:flex;flex-direction:column;gap:6px;align-items:center}
.sk-price{color:#EDB57C;font-size:13px}
.sk-pro{text-align:center}
.sk-pro ul{text-align:left;margin:10px auto;padding-left:20px;max-width:380px}
.sk-toasts{position:fixed;top:14px;left:0;right:0;z-index:1300;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none}
.sk-toast{max-width:90vw;padding:10px 16px;border-radius:12px;background:#190406;border:1px solid #CB6325;color:#E0D5C1;box-shadow:0 6px 20px rgba(0,0,0,.5);animation:sk-pop .25s ease;font-family:system-ui,sans-serif}
.sk-toast.out{opacity:0;transition:opacity .3s}
.sk-lock{z-index:1000;background:linear-gradient(#21263A,#190406);text-align:center}
.sk-lockbox{width:100%;max-width:460px}
.sk-lockbox .sk-test{margin:14px 0 0}
.sk-lock h2{margin:0 0 6px;font-size:26px;color:#EDB57C}
.sk-count{font-size:54px;font-weight:800;letter-spacing:2px;font-variant-numeric:tabular-nums;margin:6px 0}
.sk-scene{position:relative;width:100%;height:84px;overflow:hidden;margin:14px 0;border-bottom:6px solid #8B8672}
.sk-car{position:absolute;bottom:0;left:-120px;width:100px;height:48px;animation:sk-drive 6s linear infinite}
.sk-car i{position:absolute;display:block}
.sk-car .b{bottom:10px;left:0;width:100px;height:22px;background:#CB6325;border-radius:6px}
.sk-car .c{bottom:30px;left:24px;width:50px;height:16px;background:#E5805B;border-radius:10px 10px 0 0}
.sk-car .w{bottom:0;width:20px;height:20px;border-radius:50%;background:#000;border:4px solid #8B8672;border-top-color:#E0D5C1;animation:sk-spin .5s linear infinite}
.sk-car .w1{left:14px}.sk-car .w2{left:68px}
@keyframes sk-fade{from{opacity:0}to{opacity:1}}
@keyframes sk-pop{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}
@keyframes sk-drive{from{transform:translateX(0)}to{transform:translateX(calc(100vw + 240px))}}
@keyframes sk-spin{to{transform:rotate(360deg)}}
`;

export function injectStyles(): void {
  if (document.getElementById('sk-ui-style')) return;
  const s = document.createElement('style');
  s.id = 'sk-ui-style';
  s.textContent = CSS;
  document.head.append(s);
}
```

### src/ui/common.ts
```ts
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
```

### src/ui/auth.ts
```ts
import { api } from '../services/api';
import { h, openModal, toast } from './common';

function field(type: string, ph: string, ac: string): HTMLInputElement {
  const i = h('input', 'sk-input');
  i.type = type;
  i.placeholder = ph;
  i.setAttribute('autocomplete', ac);
  return i;
}

export function openAuthScreen(): void {
  const m = openModal('Сақа: вход');
  let mode: 'in' | 'up' = 'in';

  const tabs = h('div', 'sk-tabs');
  const tIn = h('button', 'sk-tab on', 'Вход');
  const tUp = h('button', 'sk-tab', 'Регистрация');
  tIn.type = 'button'; tUp.type = 'button';
  tabs.append(tIn, tUp);

  const form = h('form');
  const email = field('email', 'Email', 'email');
  const pass = field('password', 'Пароль (от 6 символов)', 'current-password');
  const nick = field('text', 'Ник в игре (2–20 символов)', 'nickname');
  nick.maxLength = 20;
  nick.style.display = 'none';
  const err = h('div', 'sk-err');
  const go = h('button', 'sk-btn wide', 'Войти');
  go.type = 'submit';
  form.append(email, pass, nick, err, go);

  const google = h('button', 'sk-btn alt wide', 'Войти через Google');
  google.type = 'button';
  const guest = h('button', 'sk-btn alt wide', 'Продолжить как гость');
  guest.type = 'button';
  m.body.append(tabs, form, google, guest);

  function setMode(v: 'in' | 'up') {
    mode = v;
    tIn.classList.toggle('on', v === 'in');
    tUp.classList.toggle('on', v === 'up');
    nick.style.display = v === 'up' ? '' : 'none';
    go.textContent = v === 'in' ? 'Войти' : 'Создать аккаунт';
    pass.setAttribute('autocomplete', v === 'in' ? 'current-password' : 'new-password');
    err.textContent = '';
  }
  tIn.onclick = () => setMode('in');
  tUp.onclick = () => setMode('up');

  const setBusy = (b: boolean) => { go.disabled = b; google.disabled = b; };
  const fail = (t: string) => { err.textContent = t; };

  form.onsubmit = async (e) => {
    e.preventDefault();
    err.textContent = '';
    const em = email.value.trim(), pw = pass.value, nk = nick.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(em)) return fail('Введите корректный email');
    if (pw.length < 6) return fail('Пароль: минимум 6 символов');
    if (mode === 'up' && (nk.length < 2 || nk.length > 20)) return fail('Ник: от 2 до 20 символов');
    setBusy(true);
    try {
      if (mode === 'in') await api.signIn(em, pw); else await api.signUp(em, pw, nk);
      let name = nk || em.split('@')[0];
      try { name = (await api.getProfile()).nickname || name; } catch { /* оставим введённый */ }
      m.close();
      toast(`Привет, ${name}!`);
    } catch (ex) {
      fail((ex as Error).message);
    } finally {
      setBusy(false);
    }
  };

  google.onclick = async () => {
    err.textContent = '';
    setBusy(true);
    try { await api.signInGoogle(); }
    catch (ex) { fail((ex as Error).message); setBusy(false); }
  };
  guest.onclick = () => m.close();
}
```

### src/ui/shop.ts
```ts
import { api, canUseSkin, canUseTakia } from '../services/api';
import type { Profile } from '../types';
import { SKINS, TAKIAS, h, openModal, proSvg, skinSvg, takiaSvg, toast } from './common';

export type ShopTab = 'skins' | 'takia' | 'pro';

export async function openShopScreen(initial: ShopTab = 'skins'): Promise<void> {
  const m = openModal('Магазин', { test: true });
  const tabs = h('div', 'sk-tabs');
  const box = h('div');
  m.body.append(tabs, box);

  let tab: ShopTab = initial;
  let profile: Profile | null = null;
  let inv: string[] = [];

  const names: [ShopTab, string][] = [['skins', 'Скины асыков'], ['takia', 'Тақия'], ['pro', 'Сақа Pro']];
  const btns = names.map(([id, label]) => {
    const b = h('button', 'sk-tab', label);
    b.type = 'button';
    b.onclick = () => { tab = id; render(); };
    tabs.append(b);
    return b;
  });

  async function load() {
    try { [profile, inv] = await Promise.all([api.getProfile(), api.getInventory()]); }
    catch (e) { toast((e as Error).message); }
  }

  function render() {
    if (!m.root.isConnected) return;
    btns.forEach((b, i) => b.classList.toggle('on', names[i][0] === tab));
    box.textContent = '';
    if (!profile) { box.append(h('p', 'sk-err', 'Не удалось загрузить данные')); return; }
    if (tab === 'pro') renderPro(profile); else renderItems(profile);
  }

  function renderItems(p: Profile) {
    type Item = { key: string; name: string; price: number; free: boolean; svg: string; selected: boolean; ok: boolean; patch: Partial<Profile> };
    const items: Item[] = tab === 'skins'
      ? SKINS.map((s) => ({ key: 'skin:' + s.id, name: s.name, price: s.price, free: s.free, svg: skinSvg(s.id),
          selected: p.asykSkin === s.id, ok: canUseSkin(s.id, inv, p.isPro), patch: { asykSkin: s.id } }))
      : TAKIAS.map((t) => ({ key: 'takia:' + t.id, name: t.name, price: t.price, free: t.free, svg: takiaSvg(t.id),
          selected: p.takia === t.id, ok: canUseTakia(t.id, inv, p.isPro), patch: { takia: t.id } }));

    const grid = h('div', 'sk-shop');
    for (const it of items) {
      const c = h('div', 'sk-prod');
      const pv = h('div', 'sk-pv');
      pv.innerHTML = it.svg;
      const via = it.free ? 'Бесплатно' : inv.includes(it.key) ? 'Куплено' : p.isPro ? 'Открыто Pro' : `${it.price} ₸ (тест)`;
      c.append(pv, h('div', '', it.name), h('div', 'sk-price', via));
      const b = h('button', 'sk-btn');
      if (!it.ok) {
        b.textContent = 'Купить (тест)';
        b.onclick = async () => {
          b.disabled = true;
          try { await api.purchase(it.key); toast('Куплено: ' + it.name); await load(); render(); }
          catch (e) { toast((e as Error).message); b.disabled = false; }
        };
      } else if (it.selected) {
        b.textContent = 'Выбрано';
        b.classList.add('alt');
        b.disabled = true;
      } else {
        b.textContent = 'Выбрать';
        b.onclick = async () => {
          try { await api.updateProfile(it.patch); await load(); render(); }
          catch (e) { toast((e as Error).message); }
        };
      }
      c.append(b);
      grid.append(c);
    }
    box.append(grid);
  }

  function renderPro(p: Profile) {
    const w = h('div', 'sk-pro');
    const pv = h('div', 'sk-pv');
    pv.innerHTML = proSvg();
    const ul = h('ul');
    ['Без лимита игрового времени: машина не мешает',
     'Эксклюзивные скины асыков: золото, орнамент, свечение',
     'Отметка Pro в профиле',
     'Только косметика: преимуществ в матче нет'].forEach((t) => ul.append(h('li', '', t)));
    w.append(pv, h('h3', 'sk-h3', 'Сақа Pro'), ul, h('div', 'sk-price', 'Цена-заглушка: 990 ₸/мес (тест)'));
    const b = h('button', 'sk-btn wide');
    if (p.isPro) {
      w.append(h('p', 'sk-h3', '✓ Pro активна'));
      b.textContent = 'Отключить (тест)';
      b.classList.add('alt');
      b.onclick = async () => {
        b.disabled = true;
        try { await api.setPro(false); toast('Pro отключена (тест)'); await load(); render(); }
        catch (e) { toast((e as Error).message); b.disabled = false; }
      };
    } else {
      b.textContent = 'Оформить Сақа Pro (тест)';
      b.onclick = async () => {
        b.disabled = true;
        try { await api.setPro(true); toast('Сақа Pro активна (тест)'); await load(); render(); }
        catch (e) { toast((e as Error).message); b.disabled = false; }
      };
    }
    w.append(b);
    box.append(w);
  }

  box.append(h('p', 'sk-muted', 'Загрузка…'));
  await load();
  render();
}
```

### src/ui/profile.ts
```ts
import { api, canUseSkin, canUseTakia } from '../services/api';
import type { Difficulty, Profile } from '../types';
import {
  DIFF_NAMES, LOCATIONS, SKINS, TAKIAS, h, openModal, skinSvg, starsText, takiaSvg, tile, toast,
} from './common';
import { openAuthScreen } from './auth';
import { openShopScreen } from './shop';

export async function openProfileScreen(): Promise<void> {
  const m = openModal('Профиль', { test: true });
  m.body.append(h('p', 'sk-muted', 'Загрузка…'));

  let data;
  try {
    data = await Promise.all([api.getProfile(), api.getInventory(), api.getUser(), api.getBest(), api.getHistory(200)]);
  } catch (e) {
    m.body.textContent = '';
    m.body.append(h('p', 'sk-err', (e as Error).message));
    return;
  }
  if (!m.root.isConnected) return;
  const [p0, inv, user, best, hist] = data;
  let p: Profile = p0;
  m.body.textContent = '';

  // шапка
  const top = h('div', 'sk-row');
  const who = h('div');
  who.append(h('div', '', user ? user.email : 'Гость'),
    h('div', 'sk-muted', user ? 'Аккаунт' : 'Прогресс хранится на этом устройстве'));
  top.append(who);
  if (p.isPro) top.append(h('span', 'sk-price', '★ PRO'));
  m.body.append(top);
  if (!user) {
    const b = h('button', 'sk-btn alt wide', 'Войти / Регистрация');
    b.onclick = () => openAuthScreen();
    m.body.append(b);
  }

  // ник
  const nickRow = h('div', 'sk-row');
  nickRow.style.marginTop = '12px';
  const nick = h('input', 'sk-input');
  nick.value = p.nickname;
  nick.maxLength = 20;
  nick.style.cssText = 'flex:1;margin:0;width:auto';
  const save = h('button', 'sk-btn', 'Сохранить');
  save.onclick = async () => {
    try { p = await api.updateProfile({ nickname: nick.value }); nick.value = p.nickname; toast('Ник сохранён'); }
    catch (e) { toast((e as Error).message); }
  };
  nickRow.append(nick, save);
  m.body.append(nickRow);

  // выбор косметики
  const choices = h('div');
  m.body.append(choices);

  async function pick(patch: Partial<Profile>) {
    try { p = await api.updateProfile(patch); renderChoices(); }
    catch (e) { toast((e as Error).message); }
  }
  function lockedHint(tab: 'skins' | 'takia') {
    toast('Доступно после покупки или с Сақа Pro');
    void openShopScreen(tab);
  }
  function renderChoices() {
    choices.textContent = '';
    const sec = (title: string, tiles: HTMLElement[]) => {
      const s = h('section', 'sk-sec');
      const g = h('div', 'sk-grid');
      g.append(...tiles);
      s.append(h('h3', 'sk-h3', title), g);
      choices.append(s);
    };
    sec('Тақия', TAKIAS.map((t) => {
      const okk = canUseTakia(t.id, inv, p.isPro);
      const b = tile(t.name, takiaSvg(t.id), p.takia === t.id, !okk);
      b.onclick = () => (okk ? pick({ takia: t.id }) : lockedHint('takia'));
      return b;
    }));
    sec('Скин асыков', SKINS.map((s) => {
      const okk = canUseSkin(s.id, inv, p.isPro);
      const b = tile(s.name, skinSvg(s.id), p.asykSkin === s.id, !okk);
      b.onclick = () => (okk ? pick({ asykSkin: s.id }) : lockedHint('skins'));
      return b;
    }));
    sec('Локация', LOCATIONS.map((l) => {
      const b = tile(l.name, `<div class="sk-loc" style="background:${l.grad}"></div>`, p.location === l.id, false);
      b.onclick = () => pick({ location: l.id });
      return b;
    }));
  }
  renderChoices();

  // рекорды
  const rec = h('section', 'sk-sec');
  rec.append(h('h3', 'sk-h3', 'Лучшие результаты'));
  const list = h('div', 'sk-list');
  (['easy', 'medium', 'hard'] as Difficulty[]).forEach((d) => {
    const row = h('div', 'sk-item');
    row.append(h('b', '', DIFF_NAMES[d]));
    const cells = h('div');
    cells.style.cssText = 'display:flex;gap:14px';
    for (let i = 0; i < 3; i++) {
      const sc = best[`${d}:${i}`];
      const xs = hist.filter((r) => r.difficulty === d && r.levelIndex === i);
      const st = xs.length ? Math.max(...xs.map((r) => r.stars)) : 0;
      const c = h('div');
      c.style.textAlign = 'center';
      c.append(h('div', '', sc === undefined ? '—' : String(sc)),
        h('div', 'sk-star', sc === undefined ? '☆☆☆' : starsText(st)));
      cells.append(c);
    }
    row.append(cells);
    list.append(row);
  });
  rec.append(list);
  m.body.append(rec);

  if (user) {
    const out = h('button', 'sk-btn alt wide', 'Выйти');
    out.onclick = async () => {
      try { await api.signOut(); toast('Вы вышли'); m.close(); }
      catch (e) { toast((e as Error).message); }
    };
    m.body.append(out);
  }
}
```

### src/ui/history.ts
```ts
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import { DIFF_NAMES, MODE_NAMES, h, openModal, starsText } from './common';

export async function openHistoryScreen(): Promise<void> {
  const m = openModal('История', { test: true });
  const tabs = h('div', 'sk-tabs');
  const tH = h('button', 'sk-tab on', 'Мои результаты');
  const tL = h('button', 'sk-tab', 'Лидеры');
  tH.type = 'button'; tL.type = 'button';
  tabs.append(tH, tL);
  const box = h('div');
  m.body.append(tabs, box);

  async function showHistory() {
    tH.classList.add('on'); tL.classList.remove('on');
    box.textContent = '';
    box.append(h('p', 'sk-muted', 'Загрузка…'));
    try {
      const rows = await api.getHistory(30);
      if (!m.root.isConnected || !tH.classList.contains('on')) return;
      box.textContent = '';
      if (!rows.length) { box.append(h('p', 'sk-muted', 'Пока пусто: сыграйте первый раунд, и он появится здесь.')); return; }
      const list = h('div', 'sk-list');
      for (const r of rows) {
        const date = new Date(r.finishedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const row = h('div', 'sk-item');
        const l = h('div');
        l.append(h('div', '', `${DIFF_NAMES[r.difficulty]} · испытание ${r.levelIndex + 1}`),
          h('div', 'sk-muted', `${date} · ${MODE_NAMES[r.mode] ?? r.mode}`));
        const rt = h('div');
        rt.style.textAlign = 'right';
        rt.append(h('div', '', `${r.score} очк.`), h('div', 'sk-star', starsText(r.stars)),
          h('div', r.won ? 'w' : 'l', r.won ? 'Победа' : 'Поражение'));
        row.append(l, rt);
        list.append(row);
      }
      box.append(list);
    } catch (e) {
      box.textContent = '';
      box.append(h('p', 'sk-err', (e as Error).message));
    }
  }

  async function showBoard() {
    tL.classList.add('on'); tH.classList.remove('on');
    box.textContent = '';
    if (!supabase) { box.append(h('p', 'sk-muted', 'Таблица лидеров появится после подключения сервера.')); return; }
    box.append(h('p', 'sk-muted', 'Загрузка…'));
    try {
      const { data, error } = await supabase.rpc('leaderboard');
      if (error) throw error;
      if (!m.root.isConnected || !tL.classList.contains('on')) return;
      box.textContent = '';
      const rows = (data ?? []) as { nickname: string; total: number }[];
      if (!rows.length) { box.append(h('p', 'sk-muted', 'Пока никого нет. Войдите в аккаунт и сыграйте первым!')); return; }
      const list = h('div', 'sk-list');
      rows.forEach((r, i) => {
        const row = h('div', 'sk-item');
        row.append(h('span', '', `${i + 1}. ${r.nickname}`), h('b', '', `${r.total} очк.`));
        list.append(row);
      });
      box.append(h('p', 'sk-muted', 'Сумма лучших очков по всем испытаниям'), list);
    } catch {
      box.textContent = '';
      box.append(h('p', 'sk-err', 'Не удалось загрузить таблицу лидеров. Проверьте интернет'));
    }
  }

  tH.onclick = () => void showHistory();
  tL.onclick = () => void showBoard();
  await showHistory();
}
```

### src/ui/lock.ts
```ts
import { api } from '../services/api';
import { h, testBanner, uiRoot } from './common';
import { openShopScreen } from './shop';

export function showLockScreen(secondsLeft: number, onUnlocked: () => void): void {
  const r = uiRoot();
  r.querySelectorAll('.sk-lock').forEach((n) => n.remove());

  const ov = h('div', 'sk-lock');
  const box = h('div', 'sk-lockbox');
  const scene = h('div', 'sk-scene');
  const car = h('div', 'sk-car');
  car.innerHTML = '<i class="b"></i><i class="c"></i><i class="w w1"></i><i class="w w2"></i>';
  scene.append(car);
  const count = h('div', 'sk-count', '--:--');
  const pro = h('button', 'sk-btn', 'Сақа Pro (тест)');
  pro.onclick = () => void openShopScreen('pro');
  box.append(
    h('h2', '', 'Машина проезжает…'),
    h('p', 'sk-muted', 'Во дворе едет машина: дети ждут, пока она проедет. Игра продолжится, когда дорога освободится.'),
    scene, count, h('p', 'sk-muted', 'До разблокировки'), pro, testBanner(),
  );
  ov.append(box);
  r.append(ov);

  let endAt = Date.now() + Math.max(0, secondsLeft) * 1000;
  let busy = false, finished = false, lastPoll = 0;
  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const finish = () => {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    ov.remove();
    onUnlocked();
  };
  const poll = async () => {
    if (busy || finished) return;
    busy = true;
    try {
      const s = await api.getPlayStatus();
      if (!s.locked) finish();
      else if (s.secondsLeft > 0) endAt = Date.now() + s.secondsLeft * 1000;
    } catch { /* нет сети: попробуем снова */ }
    finally { busy = false; lastPoll = Date.now(); }
  };
  const tick = () => {
    if (finished) return;
    const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    count.textContent = fmt(left);
    if (Date.now() - lastPoll > (left === 0 ? 1500 : 4000)) void poll();
  };
  const timer = window.setInterval(tick, 500);
  tick();
}
```

### src/ui/index.ts
```ts
import { openAuthScreen } from './auth';
import { openProfileScreen } from './profile';
import { openHistoryScreen } from './history';
import { openShopScreen } from './shop';
import { showLockScreen } from './lock';

export { toast } from './common';

export function openAuth(): void { openAuthScreen(); }
export function openProfile(): void { void openProfileScreen(); }
export function openHistory(): void { void openHistoryScreen(); }
export function openShop(): void { void openShopScreen('skins'); }
export function showLockOverlay(secondsLeft: number, onUnlocked: () => void): void {
  showLockScreen(secondsLeft, onUnlocked);
}
```

## ДОПУЩЕНИЯ
- `api.ts` дополнительно экспортирует `interface Api` и хелперы `canUseSkin`/`canUseTakia`; единственный экспорт-объект по контракту остаётся `api`.
- `PlayStatus.secondsLeft`: при `locked=true` это секунды до разблокировки, иначе остаток бюджета игры (у Pro не используется).
- Pro открывает gold/ornament/glow и все тақии; `skin:silver` в белом списке RPC есть, но серебро бесплатное.
- Звёзды в профиле берутся как максимум по истории (последние 200 раундов), так как `getBest()` отдаёт только очки.
- Перенос гостя: история целиком, рекорды без строки в истории создаются как «синтетический» результат; после успешного переноса гостевые ключи удаляются (перенос происходит один раз).
- Таблица лидеров вызывает RPC `leaderboard()` напрямую через `supabase.ts`; `Api` из контракта не расширялся.
- Цены в тенге — заглушки (99/149/199, Pro 990). Окна закрываются по ✕, Esc и клику вне окна; экран блокировки закрыть нельзя.
- `#ui-root` получает `pointer-events:none`, все окна включают его для себя сами.

## SUPABASE: ЧТО НАЖАТЬ
1. supabase.com → New project (бесплатный план), дождаться создания.
2. SQL Editor → New query → вставить `supabase/schema.sql` → Run.
3. Authentication → Providers → Email → выключить «Confirm email» → Save.
4. Project Settings → API: скопировать Project URL и anon public key.
5. Локально: `.env.example` → `.env`, вставить оба значения.
6. Vercel → Settings → Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` → Redeploy.
7. Authentication → URL Configuration: Site URL = ссылка на Vercel; в Redirect URLs добавить её и `http://localhost:5173`.
8. Google (необязательно): Providers → Google → Client ID и Secret из Google Cloud (redirect URI берётся из Supabase).
9. Тестовый аккаунт для проверяющих: Authentication → Users → Add user → Create new user (галочка Auto Confirm), логин и пароль записать в README.
10. Проверка: Table Editor → `profiles`, `results`, `purchases` после игры содержат строки.

## КАК ЗАПУСТИТЬ И ПРОВЕРИТЬ
1. Аккаунт №1: добавить зависимость `npm i @supabase/supabase-js`.
2. Без `.env` игра не падает: `npm run dev`, всё работает как у гостя (localStorage).
3. С `.env` вход и регистрация работают, гостевые рекорды переносятся в аккаунт.
4. RLS: второй аккаунт не видит чужую историю; в консоли `supabase.from('profiles').update({is_pro:true})` даёт ошибку прав.
5. Лимит: `localStorage.setItem('saka.guest.play', JSON.stringify({left:15,until:null}))`, поиграть 15 с → «Машина проезжает».
6. Покупка: Магазин → «Купить (тест)» → предмет выбирается; Pro снимает блокировку сразу.