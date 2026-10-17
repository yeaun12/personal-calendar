begin;
create policy mb_groups_rpc_only on public.mb_groups for all to authenticated using(false) with check(false);
create policy mb_members_rpc_only on public.mb_members for all to authenticated using(false) with check(false);
create policy mb_polls_rpc_only on public.mb_polls for all to authenticated using(false) with check(false);
create policy mb_votes_rpc_only on public.mb_votes for all to authenticated using(false) with check(false);
commit;
