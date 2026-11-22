-- Pre-approved host emails: when such a user is created (dashboard or sign-up), they become a host.
-- Add hosts with:  insert into private.host_allowlist (email) values ('someone@example.com');
create table if not exists private.host_allowlist (email text primary key check (email = lower(email)));

create or replace function private.grant_host_on_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from private.host_allowlist a where a.email = lower(new.email)) then
    insert into public.hosts (user_id, display_name) values (new.id, new.email) on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function private.grant_host_on_signup() from public, anon, authenticated;

drop trigger if exists grant_host_on_signup on auth.users;
create trigger grant_host_on_signup after insert or update of email on auth.users
  for each row execute function private.grant_host_on_signup();

-- Backfill (in case the user already exists).
insert into public.hosts (user_id, display_name)
select u.id, u.email from auth.users u join private.host_allowlist a on a.email = lower(u.email)
on conflict do nothing;
