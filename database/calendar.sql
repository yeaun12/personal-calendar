begin;
create table public.mb_calendar_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 100),
 starts_at timestamptz not null, ends_at timestamptz not null,
 visibility text not null default 'private' check(visibility in ('private','public')),
 updated_at timestamptz not null default now(),
 check(ends_at>starts_at and ends_at<=starts_at+interval '366 days')
);
create index mb_calendar_owner_start_idx on public.mb_calendar_events(user_id,starts_at);
alter table public.mb_calendar_events enable row level security;
revoke all on public.mb_calendar_events from public,anon,authenticated;
create policy calendar_rpc_only on public.mb_calendar_events for all to authenticated using(false) with check(false);
-- The private definer projects permitted fields explicitly; no raw event rows are shared.
create function moyeobom_private.calendar_api(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); target uuid; eid uuid; lo timestamptz; hi timestamptz; st timestamptz; en timestamptz; label text; vis text; result jsonb;
begin
 if uid is null then raise exception '로그인이 필요해요.' using errcode='42501'; end if;
 if action='list' then
  target:=coalesce((payload->>'user_id')::uuid,uid);
  if target<>uid and not exists(select 1 from public.mb_members a join public.mb_members b on b.group_id=a.group_id where a.user_id=uid and b.user_id=target) then
   raise exception '같은 모임의 캘린더만 볼 수 있어요.' using errcode='42501';
  end if;
  lo:=(payload->>'from')::timestamptz; hi:=(payload->>'to')::timestamptz;
  if lo is null or hi is null or hi<=lo or hi-lo>interval '62 days' then raise exception '조회 기간을 확인해주세요.'; end if;
  select coalesce(jsonb_agg(q.item order by q.starts_at),'[]'::jsonb) into result from (
   select e.starts_at,jsonb_build_object('id',e.id,'kind','personal','title',case when target=uid or e.visibility='public' then e.title else null end,
    'starts_at',e.starts_at,'ends_at',e.ends_at,'visibility',e.visibility,'editable',target=uid) item
   from public.mb_calendar_events e where e.user_id=target and e.starts_at<hi and e.ends_at>lo
   union all
   select t.st,jsonb_build_object('id',p.id,'kind','group','title',case when access.allowed then p.title else null end,
    'starts_at',t.st,'ends_at',t.st+make_interval(mins=>p.duration_min),'visibility',case when access.allowed then 'public' else 'private' end,'editable',false)
   from public.mb_polls p
   cross join lateral(select (split_part(p.final_slot,'|',1)::date+make_interval(mins=>split_part(p.final_slot,'|',2)::int)) at time zone 'Asia/Seoul' st) t
   cross join lateral(select exists(select 1 from public.mb_members m where m.group_id=p.group_id and m.user_id=uid) allowed) access
   where p.status='finalized' and p.final_slot is not null
    and exists(select 1 from public.mb_members m where m.group_id=p.group_id and m.user_id=target)
    and t.st<hi and t.st+make_interval(mins=>p.duration_min)>lo
  ) q;
  return result;
 elsif action in ('save','delete') then
  eid:=nullif(payload->>'id','')::uuid;
  if eid is not null then
   perform 1 from public.mb_calendar_events where id=eid and user_id=uid for update;
   if not found then raise exception '내 일정만 수정하거나 삭제할 수 있어요.' using errcode='42501'; end if;
  end if;
  if action='delete' then
   if eid is null then raise exception '삭제할 일정을 선택해주세요.'; end if;
   delete from public.mb_calendar_events where id=eid and user_id=uid;return '{}'::jsonb;
  end if;
  label:=btrim(payload->>'title');st:=(payload->>'starts_at')::timestamptz;en:=(payload->>'ends_at')::timestamptz;vis:=coalesce(payload->>'visibility','private');
  if label is null or length(label) not between 1 and 100 or st is null or en is null or en<=st or en>st+interval '366 days' or vis not in ('private','public') then raise exception '일정 이름과 시작·종료 시간, 공개 범위를 확인해주세요.'; end if;
  if eid is null then
   insert into public.mb_calendar_events(user_id,title,starts_at,ends_at,visibility) values(uid,label,st,en,vis) returning id into eid;
  else
   update public.mb_calendar_events set title=label,starts_at=st,ends_at=en,visibility=vis,updated_at=now() where id=eid and user_id=uid;
  end if;
  return jsonb_build_object('id',eid);
 end if;
 raise exception '지원하지 않는 요청이에요.';
end $$;
revoke all on function moyeobom_private.calendar_api(text,jsonb) from public,anon;
grant execute on function moyeobom_private.calendar_api(text,jsonb) to authenticated;
create function public.moyeobom_calendar(action text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select moyeobom_private.calendar_api(action,payload) $$;
revoke all on function public.moyeobom_calendar(text,jsonb) from public,anon;
grant execute on function public.moyeobom_calendar(text,jsonb) to authenticated;
commit;
