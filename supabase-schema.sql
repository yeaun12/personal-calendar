begin;
-- 모여봄: 개인 소유 투표 저장 단계. 기존 표를 삭제하지 않습니다.
create table if not exists public.polls (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(char_length(trim(title)) between 1 and 100), category text not null default '기타' check(char_length(category)<=40),
 dates date[] not null check(cardinality(dates) between 1 and 31), start_minutes smallint not null check(start_minutes>=0 and start_minutes<1440),
 end_minutes smallint not null check(end_minutes>start_minutes and end_minutes<=1440), status text not null default 'open' check(status in ('open','closed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.poll_responses (
 id uuid primary key default gen_random_uuid(), poll_id uuid not null references public.polls(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade, participant_name text not null check(char_length(trim(participant_name)) between 1 and 60),
 slots jsonb not null default '[]'::jsonb check(jsonb_typeof(slots)='array'), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint poll_responses_poll_name_unique unique(poll_id,participant_name)
);
alter table public.polls enable row level security;
alter table public.poll_responses enable row level security;
revoke all on public.polls, public.poll_responses from anon;
revoke truncate, references, trigger on public.polls, public.poll_responses from authenticated;
grant select, insert, update, delete on public.polls, public.poll_responses to authenticated;
-- Policies already exist in the connected project. Replacing only these named policies is repeatable.
drop policy if exists polls_owner_select on public.polls;
create policy polls_owner_select on public.polls for select to authenticated using ((select auth.uid())=owner_id);
drop policy if exists polls_owner_insert on public.polls;
create policy polls_owner_insert on public.polls for insert to authenticated with check ((select auth.uid())=owner_id);
drop policy if exists polls_owner_update on public.polls;
create policy polls_owner_update on public.polls for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
drop policy if exists polls_owner_delete on public.polls;
create policy polls_owner_delete on public.polls for delete to authenticated using ((select auth.uid())=owner_id);
drop policy if exists responses_owner_select on public.poll_responses;
create policy responses_owner_select on public.poll_responses for select to authenticated using ((select auth.uid())=owner_id and exists(select 1 from public.polls p where p.id=poll_id and p.owner_id=(select auth.uid())));
drop policy if exists responses_owner_insert on public.poll_responses;
create policy responses_owner_insert on public.poll_responses for insert to authenticated with check ((select auth.uid())=owner_id and exists(select 1 from public.polls p where p.id=poll_id and p.owner_id=(select auth.uid()) and p.status='open'));
drop policy if exists responses_owner_update on public.poll_responses;
create policy responses_owner_update on public.poll_responses for update to authenticated using ((select auth.uid())=owner_id and exists(select 1 from public.polls p where p.id=poll_id and p.owner_id=(select auth.uid()) and p.status='open')) with check ((select auth.uid())=owner_id and exists(select 1 from public.polls p where p.id=poll_id and p.owner_id=(select auth.uid()) and p.status='open'));
drop policy if exists responses_owner_delete on public.poll_responses;
create policy responses_owner_delete on public.poll_responses for delete to authenticated using ((select auth.uid())=owner_id and exists(select 1 from public.polls p where p.id=poll_id and p.owner_id=(select auth.uid()) and p.status='open'));
create index if not exists polls_owner_created_idx on public.polls(owner_id,created_at desc);
create index if not exists poll_responses_owner_idx on public.poll_responses(owner_id);
-- Validate slot shape and membership against the actual stored poll, as the caller (no SECURITY DEFINER).
create or replace function public.validate_poll_response_slots() returns trigger language plpgsql security invoker set search_path='' as $$
declare p public.polls; item jsonb; date_part text; minute_part integer;
begin
 select * into p from public.polls where id=new.poll_id for share;
 if not found or p.owner_id<>auth.uid() or p.status<>'open' then raise exception 'Poll is unavailable or closed' using errcode='42501'; end if;
 if jsonb_typeof(new.slots)<>'array' or jsonb_array_length(new.slots)<1 or jsonb_array_length(new.slots)>1488 then raise exception 'Invalid slots' using errcode='23514'; end if;
 for item in select value from jsonb_array_elements(new.slots) loop
  if jsonb_typeof(item)<>'string' or (item #>> '{}') !~ '^\d{4}-\d{2}-\d{2}\|\d{1,4}$' then raise exception 'Invalid slot format' using errcode='23514'; end if;
  date_part=split_part(item #>> '{}','|',1); minute_part=split_part(item #>> '{}','|',2)::integer;
  if not exists(select 1 from unnest(p.dates) d where to_char(d,'YYYY-MM-DD')=date_part) or minute_part<p.start_minutes or minute_part>=p.end_minutes or (minute_part-p.start_minutes)%30<>0 then raise exception 'Slot outside poll' using errcode='23514'; end if;
 end loop;
 new.updated_at=now(); return new;
end $$;
revoke all on function public.validate_poll_response_slots() from public, anon;
drop trigger if exists validate_poll_response_slots on public.poll_responses;
create trigger validate_poll_response_slots before insert or update on public.poll_responses for each row execute function public.validate_poll_response_slots();

commit;
