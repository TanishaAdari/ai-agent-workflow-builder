insert into organizations(name,calls_allowed) values ('Org A',100),('Org B',100);

-- Replace the UUIDs before running these statements.
insert into org_members(org_id,user_id,role)
select id,'ORG_A_OWNER_UUID','owner' from organizations where name='Org A';
insert into org_members(org_id,user_id,role)
select id,'ORG_A_EDITOR_UUID','editor' from organizations where name='Org A';
insert into org_members(org_id,user_id,role)
select id,'ORG_B_OWNER_UUID','owner' from organizations where name='Org B';
insert into org_members(org_id,user_id,role)
select id,'ORG_B_VIEWER_UUID','viewer' from organizations where name='Org B';
