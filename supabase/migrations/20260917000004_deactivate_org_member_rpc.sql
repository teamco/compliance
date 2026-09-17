-- deactivate_org_member: atomically deactivate a membership row and revoke
-- any pending invite for the same org+email, so a crash/network drop between
-- the two updates can't leave a deactivated member with a live pending
-- invite still floating around.
create or replace function deactivate_org_member(p_org_id uuid, p_user_id uuid, p_email text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update organization_members
     set is_active = false, deactivated_at = now()
   where org_id = p_org_id and user_id = p_user_id;

  if p_email is not null then
    update organization_invites
       set status = 'revoked'
     where org_id = p_org_id
       and status = 'pending'
       and lower(email) = lower(p_email);
  end if;
end;
$$;

revoke all     on function deactivate_org_member(uuid, uuid, text) from public;
revoke execute on function deactivate_org_member(uuid, uuid, text) from anon;
revoke execute on function deactivate_org_member(uuid, uuid, text) from authenticated;
grant  execute on function deactivate_org_member(uuid, uuid, text) to service_role;
