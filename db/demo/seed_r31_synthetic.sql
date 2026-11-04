-- R31 DEMO ONLY. Synthetic, fictional customer/identities; NO passwords.
-- Apply only after 0001_r0_iam_rls.sql in an isolated disposable database.
-- DO NOT run against staging/production or any shared database.
BEGIN;
INSERT INTO ai_law.principals(user_id,identity_provider_id,status) VALUES
 ('44444444-4444-4444-8444-444444444441','demo.invalid:owner','active'),
 ('44444444-4444-4444-8444-444444444442','demo.invalid:lawyer','active'),
 ('44444444-4444-4444-8444-444444444443','demo.invalid:outsider','active');
INSERT INTO ai_law.tenants(tenant_id,tenant_type) VALUES
 ('55555555-5555-4555-8555-555555555551','organization'),
 ('55555555-5555-4555-8555-555555555552','organization');
INSERT INTO ai_law.role_catalog(role_key,description,registry_version) VALUES
 ('tenant_admin','Synthetic tenant administrator','1.1.15'),
 ('lawyer','Synthetic legal professional','1.1.15');
INSERT INTO ai_law.memberships
 (membership_id,tenant_id,user_id,status,authz_version,role_registry_version,joined_at)
 VALUES
 ('66666666-6666-4666-8666-666666666661','55555555-5555-4555-8555-555555555551','44444444-4444-4444-8444-444444444441','active',1,'1.1.15',now()-interval '1 day'),
 ('66666666-6666-4666-8666-666666666662','55555555-5555-4555-8555-555555555551','44444444-4444-4444-8444-444444444442','active',1,'1.1.15',now()-interval '1 day'),
 ('66666666-6666-4666-8666-666666666663','55555555-5555-4555-8555-555555555552','44444444-4444-4444-8444-444444444443','active',1,'1.1.15',now()-interval '1 day');
INSERT INTO ai_law.membership_roles(tenant_id,membership_id,role_key,registry_version) VALUES
 ('55555555-5555-4555-8555-555555555551','66666666-6666-4666-8666-666666666661','tenant_admin','1.1.15'),
 ('55555555-5555-4555-8555-555555555551','66666666-6666-4666-8666-666666666662','lawyer','1.1.15'),
 ('55555555-5555-4555-8555-555555555552','66666666-6666-4666-8666-666666666663','lawyer','1.1.15');
INSERT INTO ai_law.matters(tenant_id,matter_id,owner_user_id,acl_version) VALUES
 ('55555555-5555-4555-8555-555555555551','77777777-7777-4777-8777-777777777771','44444444-4444-4444-8444-444444444441',1),
 ('55555555-5555-4555-8555-555555555552','77777777-7777-4777-8777-777777777772','44444444-4444-4444-8444-444444444443',1);
-- Explicit access for lawyer; tenant admin has no implicit MatterACL bypass.
INSERT INTO ai_law.matter_user_acl
 (tenant_id,matter_id,user_id,permission,effect,acl_version,valid_from)
 VALUES
 ('55555555-5555-4555-8555-555555555551','77777777-7777-4777-8777-777777777771','44444444-4444-4444-8444-444444444442','read','allow',1,now()-interval '1 hour'),
 ('55555555-5555-4555-8555-555555555552','77777777-7777-4777-8777-777777777772','44444444-4444-4444-8444-444444444443','read','allow',1,now()-interval '1 hour');
COMMIT;
