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
