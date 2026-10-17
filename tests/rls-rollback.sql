-- Transaction-scoped synthetic users; no credentials, mail, or permanent test data.
begin;
select set_config('test.owner',gen_random_uuid()::text,true),set_config('test.other',gen_random_uuid()::text,true),set_config('test.poll',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('test.owner')::uuid),(current_setting('test.other')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
insert into public.polls(id,owner_id,title,category,dates,start_minutes,end_minutes) values(current_setting('test.poll')::uuid,auth.uid(),'__rollback_verification__','meal',array['2026-12-01'::date],600,660);
insert into public.poll_responses(poll_id,owner_id,participant_name,slots) values(current_setting('test.poll')::uuid,auth.uid(),'rollback tester','["2026-12-01|600"]');
do $$ begin
 if (select count(*) from public.polls where id=current_setting('test.poll')::uuid)<>1 then raise exception 'Owner read failed'; end if;
 if (select count(*) from public.poll_responses where poll_id=current_setting('test.poll')::uuid)<>1 then raise exception 'Owner response read failed'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
do $$ declare n integer; begin
 if exists(select 1 from public.polls where id=current_setting('test.poll')::uuid) then raise exception 'Cross-user poll leak'; end if;
 if exists(select 1 from public.poll_responses where poll_id=current_setting('test.poll')::uuid) then raise exception 'Cross-user response leak'; end if;
 update public.polls set title='unauthorized' where id=current_setting('test.poll')::uuid;
 get diagnostics n=row_count; if n<>0 then raise exception 'Cross-user update allowed'; end if;
 begin
  insert into public.poll_responses(poll_id,owner_id,participant_name,slots) values(current_setting('test.poll')::uuid,auth.uid(),'other','["2026-12-01|600"]');
  raise exception 'Cross-user insert allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
do $$ begin
 begin
  insert into public.poll_responses(poll_id,owner_id,participant_name,slots) values(current_setting('test.poll')::uuid,auth.uid(),'invalid-slot','["2026-12-01|700"]');
  raise exception 'Invalid slot accepted';
 exception when check_violation then null; end;
end $$;
update public.polls set status='closed' where id=current_setting('test.poll')::uuid;
do $$ declare n integer; begin
 begin
  insert into public.poll_responses(poll_id,owner_id,participant_name,slots) values(current_setting('test.poll')::uuid,auth.uid(),'closed-write','["2026-12-01|600"]');
  raise exception 'Closed write accepted';
 exception when insufficient_privilege then null; end;
 update public.poll_responses set slots='["2026-12-01|630"]' where poll_id=current_setting('test.poll')::uuid;
 get diagnostics n=row_count; if n<>0 then raise exception 'Closed update accepted'; end if;
end $$;
update public.polls set status='open' where id=current_setting('test.poll')::uuid;
update public.poll_responses set slots='["2026-12-01|630"]' where poll_id=current_setting('test.poll')::uuid;
do $$ begin
 if not exists(select 1 from public.poll_responses where poll_id=current_setting('test.poll')::uuid and slots='["2026-12-01|630"]') then raise exception 'Reopen write failed'; end if;
end $$;
set local role anon;
do $$ begin
 begin
  perform 1 from public.polls limit 1; raise exception 'Anonymous table access allowed';
 exception when insufficient_privilege then null; end;
end $$;
select 'PASS owner CRUD, cross-user reads/updates/inserts blocked, invalid slot blocked, closed writes blocked, reopened write works, anonymous access blocked; rollback' as result;
rollback;
