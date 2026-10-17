begin;
create schema if not exists moyeobom_private;
revoke all on schema moyeobom_private from public, anon;
grant usage on schema moyeobom_private to authenticated;
create table public.mb_groups (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 60),
 owner_id uuid not null references auth.users(id), invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)), created_at timestamptz not null default now()
);
create table public.mb_members (
 group_id uuid references public.mb_groups(id) on delete cascade, user_id uuid references auth.users(id) on delete cascade,
 joined_at timestamptz not null default now(), primary key(group_id,user_id)
);
create index mb_members_user_idx on public.mb_members(user_id);
create table public.mb_polls (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.mb_groups(id), title text not null check(length(btrim(title)) between 1 and 100),
 dates date[] not null check(cardinality(dates) between 1 and 14), start_min int not null check(start_min between 0 and 1410 and start_min % 30=0), end_min int not null check(end_min > start_min and end_min<=1440 and end_min % 30=0),
 duration_min int not null check(duration_min between 30 and 480 and duration_min % 30=0), activities text[] not null check(cardinality(activities) between 1 and 12),
 deadline timestamptz not null, status text not null default 'open' check(status in ('open','closed','finalized')),
 final_slot text, final_activity text, place text not null default '' check(length(place)<=200), created_at timestamptz not null default now()
);
create index mb_polls_group_idx on public.mb_polls(group_id);
create table public.mb_votes (
 poll_id uuid references public.mb_polls(id) on delete cascade, user_id uuid references auth.users(id) on delete cascade,
 slots text[] not null default '{}', activities text[] not null default '{}', unavailable boolean not null default false,
 updated_at timestamptz not null default now(), primary key(poll_id,user_id)
);
create index mb_votes_user_idx on public.mb_votes(user_id);
alter table public.mb_groups enable row level security;
alter table public.mb_members enable row level security;
alter table public.mb_polls enable row level security;
alter table public.mb_votes enable row level security;
-- Intentional RPC-only interface: tables have no direct client privileges/policies.
revoke all on public.mb_groups,public.mb_members,public.mb_polls,public.mb_votes from public,anon,authenticated;
create or replace function moyeobom_private.group_api(action text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); g public.mb_groups; p public.mb_polls; gid uuid; pid uuid; code text; slots text[]; acts text[]; ds date[]; s text; d date; m int; n int; dur int; st int; en int; until_at timestamptz; absent boolean;
begin
 if uid is null then raise exception '로그인이 필요해요.' using errcode='42501'; end if;
 if action='snapshot' then
 return jsonb_build_object(
 'groups',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'owner_id',x.owner_id,'created_at',x.created_at,'invite_code',case when x.owner_id=uid then x.invite_code else null end) order by x.created_at desc) from public.mb_groups x where exists(select 1 from public.mb_members mm where mm.group_id=x.id and mm.user_id=uid)),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(jsonb_build_object('group_id',mm.group_id,'user_id',mm.user_id,'nickname',coalesce(nullif(left(u.raw_user_meta_data->>'nickname',30),''),'모임원'))) from public.mb_members mm join auth.users u on u.id=mm.user_id where exists(select 1 from public.mb_members own where own.group_id=mm.group_id and own.user_id=uid)),'[]'::jsonb),
 'polls',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.mb_polls x where exists(select 1 from public.mb_members mm where mm.group_id=x.group_id and mm.user_id=uid)),'[]'::jsonb),
 'votes',coalesce((select jsonb_agg(to_jsonb(v)) from public.mb_votes v join public.mb_polls x on x.id=v.poll_id where exists(select 1 from public.mb_members mm where mm.group_id=x.group_id and mm.user_id=uid)),'[]'::jsonb));
 elsif action='create_group' then
 if (select count(*) from public.mb_groups where owner_id=uid)>=30 then raise exception '모임은 최대 30개까지 만들 수 있어요.'; end if;
 insert into public.mb_groups(name,owner_id) values(btrim(payload->>'name'),uid) returning * into g;
 insert into public.mb_members(group_id,user_id) values(g.id,uid); return jsonb_build_object('id',g.id);
 elsif action in ('preview_join','join_group') then
 code:=upper(regexp_replace(coalesce(payload->>'code',''),'[^a-zA-Z0-9]','','g'));
 if length(code)<>12 then raise exception '12자리 모임 코드를 확인해 주세요.'; end if;
 select * into g from public.mb_groups where invite_code=code for update;
 if not found then raise exception '유효하지 않은 모임 코드예요.'; end if;
 if action='join_group' then
 if (select count(*) from public.mb_members where group_id=g.id)>=100 and not exists(select 1 from public.mb_members where group_id=g.id and user_id=uid) then raise exception '모임 정원은 100명이에요.'; end if;
 insert into public.mb_members(group_id,user_id) values(g.id,uid) on conflict do nothing;
 end if; return jsonb_build_object('id',g.id,'name',g.name);
 end if;
 if action in ('create_poll','rotate_code') then
 gid:=(payload->>'group_id')::uuid;
 select * into g from public.mb_groups where id=gid for update;
 if not found or g.owner_id<>uid then raise exception '모임장만 할 수 있어요.' using errcode='42501'; end if;
 if action='rotate_code' then update public.mb_groups set invite_code=upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)) where id=gid; return '{}'::jsonb; end if;
 select array_agg(distinct value::date order by value::date) into ds from jsonb_array_elements_text(payload->'dates');
 select array_agg(distinct btrim(value)) into acts from jsonb_array_elements_text(payload->'activities');
 if ds is null or acts is null or exists(select 1 from unnest(acts) a where length(a) not between 1 and 40) then raise exception '날짜와 활동 후보를 확인해 주세요.'; end if;
 if ds[1] < (now() at time zone 'Asia/Seoul')::date then raise exception '지난 날짜로 투표를 만들 수 없어요.'; end if;
 st:=(payload->>'start_min')::int; en:=(payload->>'end_min')::int; dur:=(payload->>'duration_min')::int; until_at:=(payload->>'deadline')::timestamptz;
 if dur > en-st or until_at<=now() or until_at > ((ds[1]+make_interval(mins=>st)) at time zone 'Asia/Seoul') then raise exception '소요 시간과 마감 시간을 확인해 주세요. 마감은 첫 후보 시간 이전이어야 해요.'; end if;
 insert into public.mb_polls(group_id,title,dates,start_min,end_min,duration_min,activities,deadline) values(gid,btrim(payload->>'title'),ds,st,en,dur,acts,until_at) returning id into pid;
 return jsonb_build_object('id',pid);
 end if;
 pid:=(payload->>'poll_id')::uuid;
 select * into p from public.mb_polls where id=pid for update;
 if not found or not exists(select 1 from public.mb_members where group_id=p.group_id and user_id=uid) then raise exception '이 모임에 접근할 수 없어요.' using errcode='42501'; end if;
 select * into g from public.mb_groups where id=p.group_id;
 if action in ('close','reopen','finalize') then
 if g.owner_id<>uid then raise exception '모임장만 할 수 있어요.' using errcode='42501'; end if;
 if action='close' then
 if p.status='finalized' then raise exception '이미 확정된 약속이에요.'; end if;
 update public.mb_polls set status='closed' where id=pid;
 elsif action='reopen' then
 until_at:=(payload->>'deadline')::timestamptz;
 if until_at is null or until_at<=now() or until_at>((p.dates[1]+make_interval(mins=>p.start_min)) at time zone 'Asia/Seoul') then raise exception '새 마감은 현재 이후, 첫 후보 시간 이전으로 정해주세요.'; end if;
 update public.mb_polls set status='open',deadline=until_at,final_slot=null,final_activity=null,place='' where id=pid;
 else
 s:=payload->>'slot';
 if s is null or s !~ '^\d{4}-\d{2}-\d{2}\|[0-9]{1,4}$' then raise exception '확정 시간을 선택해주세요.'; end if;
 d:=split_part(s,'|',1)::date; m:=split_part(s,'|',2)::int;
 if not(d=any(p.dates)) or m<p.start_min or m+p.duration_min>p.end_min or m%30<>0 then raise exception '후보 범위 안의 시간을 선택해주세요.'; end if;
 if not coalesce((payload->>'activity')=any(p.activities),false) then raise exception '활동 후보를 선택해주세요.'; end if;
 update public.mb_polls set status='finalized',final_slot=s,final_activity=payload->>'activity',place=coalesce(btrim(payload->>'place'),'') where id=pid;
 end if; return '{}'::jsonb;
 elsif action='add_activity' then
 if p.status<>'open' or now()>=p.deadline then raise exception '마감된 투표예요.'; end if;
 s:=btrim(payload->>'activity');
 if s is null or length(s) not between 1 and 40 or cardinality(p.activities)>=12 then raise exception '활동은 40자 이내, 최대 12개예요.'; end if;
 if not(s=any(p.activities)) then update public.mb_polls set activities=array_append(activities,s) where id=pid; end if; return '{}'::jsonb;
 elsif action='vote' then
 if p.status<>'open' or now()>=p.deadline then raise exception '마감된 투표예요. 모임장에게 다시 열어달라고 요청해주세요.'; end if;
 select coalesce(array_agg(distinct value),'{}') into slots from jsonb_array_elements_text(payload->'slots');
 select coalesce(array_agg(distinct value),'{}') into acts from jsonb_array_elements_text(payload->'activities');
 absent:=coalesce((payload->>'unavailable')::boolean,false);
 if cardinality(slots)>672 or (not absent and cardinality(slots)=0) or (absent and cardinality(slots)>0) then raise exception '가능한 시간을 선택하거나 이번에는 어려워요를 선택해주세요.'; end if;
 foreach s in array slots loop
 if s !~ '^\d{4}-\d{2}-\d{2}\|[0-9]{1,4}$' then raise exception '잘못된 시간 형식이에요.'; end if;
 d:=split_part(s,'|',1)::date; m:=split_part(s,'|',2)::int;
 if not(d=any(p.dates)) or m<p.start_min or m>=p.end_min or m%30<>0 then raise exception '투표 후보에 없는 시간이에요.'; end if;
 end loop;
 if not(acts <@ p.activities) then raise exception '등록되지 않은 활동이에요.'; end if;
 insert into public.mb_votes(poll_id,user_id,slots,activities,unavailable) values(pid,uid,slots,acts,absent)
 on conflict(poll_id,user_id) do update set slots=excluded.slots,activities=excluded.activities,unavailable=excluded.unavailable,updated_at=now();
 return '{}'::jsonb;
 end if;
 raise exception '지원하지 않는 요청이에요.';
end $$;
revoke all on function moyeobom_private.group_api(text,jsonb) from public,anon;
grant execute on function moyeobom_private.group_api(text,jsonb) to authenticated;
create or replace function public.moyeobom(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select moyeobom_private.group_api(action,payload) $$;
revoke all on function public.moyeobom(text,jsonb) from public,anon;
grant execute on function public.moyeobom(text,jsonb) to authenticated;
commit;
