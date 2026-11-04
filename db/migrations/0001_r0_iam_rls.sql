-- R30 synthetic-only PostgreSQL 16 IAM/MatterACL migration.
-- Implements the SRS v1.1.15 iam_minimal.sql *subset* in dedicated schema.
-- Not a production migration or authorization for real client data. No seeded
-- roles/users, no real IdP/session/run store, no service passwords in this file.
-- Apply as privileged migration owner in a disposable database only.
BEGIN;
CREATE SCHEMA ai_law;
REVOKE ALL ON SCHEMA ai_law FROM PUBLIC;

CREATE TABLE ai_law.principals (
  user_id UUID PRIMARY KEY,
  identity_provider_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active','suspended','disabled'))
);
CREATE TABLE ai_law.tenants (
  tenant_id UUID PRIMARY KEY,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('personal','organization'))
);
CREATE TABLE ai_law.memberships (
  membership_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES ai_law.tenants(tenant_id),
  user_id UUID NOT NULL REFERENCES ai_law.principals(user_id),
  status TEXT NOT NULL CHECK (status IN ('active','suspended','revoked')),
  authz_version BIGINT NOT NULL CHECK (authz_version>=1),
  role_registry_version TEXT NOT NULL CHECK (length(trim(role_registry_version))>0),
  joined_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  UNIQUE(tenant_id,user_id),
  UNIQUE(tenant_id,membership_id),
  UNIQUE(tenant_id,membership_id,role_registry_version),
  CHECK(status <> 'revoked' OR revoked_at IS NOT NULL),
  CHECK(revoked_at IS NULL OR revoked_at>=joined_at)
);
CREATE TABLE ai_law.role_catalog (
  role_key TEXT NOT NULL,
  description TEXT NOT NULL,
  registry_version TEXT NOT NULL CHECK(length(trim(registry_version))>0),
  PRIMARY KEY(role_key,registry_version)
);
CREATE TABLE ai_law.membership_roles (
  tenant_id UUID NOT NULL,
  membership_id UUID NOT NULL,
  role_key TEXT NOT NULL,
  registry_version TEXT NOT NULL,
  PRIMARY KEY(tenant_id,membership_id,role_key,registry_version),
  FOREIGN KEY(tenant_id,membership_id,registry_version)
    REFERENCES ai_law.memberships(tenant_id,membership_id,role_registry_version),
  FOREIGN KEY(role_key,registry_version)
    REFERENCES ai_law.role_catalog(role_key,registry_version)
);
CREATE TABLE ai_law.matter_groups (
  tenant_id UUID NOT NULL REFERENCES ai_law.tenants(tenant_id),
  group_id UUID NOT NULL,
  group_name TEXT NOT NULL,
  PRIMARY KEY(tenant_id,group_id)
);
CREATE TABLE ai_law.matter_group_members (
  tenant_id UUID NOT NULL,
  group_id UUID NOT NULL,
  user_id UUID NOT NULL,
  PRIMARY KEY(tenant_id,group_id,user_id),
  FOREIGN KEY(tenant_id,group_id) REFERENCES ai_law.matter_groups(tenant_id,group_id),
  FOREIGN KEY(tenant_id,user_id) REFERENCES ai_law.memberships(tenant_id,user_id)
);
CREATE TABLE ai_law.matters (
  tenant_id UUID NOT NULL REFERENCES ai_law.tenants(tenant_id),
  matter_id UUID NOT NULL,
  owner_user_id UUID NOT NULL,
  acl_version BIGINT NOT NULL CHECK(acl_version>=1),
  PRIMARY KEY(tenant_id,matter_id),
  FOREIGN KEY(tenant_id,owner_user_id) REFERENCES ai_law.memberships(tenant_id,user_id)
);
CREATE TABLE ai_law.matter_user_acl (
  tenant_id UUID NOT NULL,
  matter_id UUID NOT NULL,
  user_id UUID NOT NULL,
  permission TEXT NOT NULL CHECK(permission IN ('read','write','approve','export','manage')),
  effect TEXT NOT NULL CHECK(effect IN ('allow','deny')),
  acl_version BIGINT NOT NULL CHECK(acl_version>=1),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ,
  CHECK(valid_to IS NULL OR valid_to>valid_from),
  PRIMARY KEY(tenant_id,matter_id,user_id,permission,effect,valid_from),
  FOREIGN KEY(tenant_id,matter_id) REFERENCES ai_law.matters(tenant_id,matter_id),
  FOREIGN KEY(tenant_id,user_id) REFERENCES ai_law.memberships(tenant_id,user_id)
);
CREATE TABLE ai_law.matter_group_acl (
  tenant_id UUID NOT NULL,
  matter_id UUID NOT NULL,
  group_id UUID NOT NULL,
  permission TEXT NOT NULL CHECK(permission IN ('read','write','approve','export','manage')),
  effect TEXT NOT NULL CHECK(effect IN ('allow','deny')),
  acl_version BIGINT NOT NULL CHECK(acl_version>=1),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ,
  CHECK(valid_to IS NULL OR valid_to>valid_from),
  PRIMARY KEY(tenant_id,matter_id,group_id,permission,effect,valid_from),
  FOREIGN KEY(tenant_id,matter_id) REFERENCES ai_law.matters(tenant_id,matter_id),
  FOREIGN KEY(tenant_id,group_id) REFERENCES ai_law.matter_groups(tenant_id,group_id)
);
-- Physical ACL union has invoker security; a default owner-rights view would
-- bypass the base table policies in PostgreSQL 16.
CREATE VIEW ai_law.matter_acl WITH (security_invoker=true) AS
 SELECT tenant_id,matter_id,'user'::TEXT AS subject_type,user_id AS subject_id,
        permission,effect,acl_version,valid_from,valid_to
 FROM ai_law.matter_user_acl
 UNION ALL
 SELECT tenant_id,matter_id,'group'::TEXT AS subject_type,group_id AS subject_id,
        permission,effect,acl_version,valid_from,valid_to
 FROM ai_law.matter_group_acl;

-- Minimal security metadata only: not a complete immutable legal audit/outbox.
CREATE TABLE ai_law.iam_audit (
  audit_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID NOT NULL,
  membership_id UUID NOT NULL,
  user_id UUID NOT NULL,
  change_kind TEXT NOT NULL,
  old_authz_version BIGINT,
  new_authz_version BIGINT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION ai_law.actor_tenant() RETURNS uuid LANGUAGE sql STABLE
SET search_path=pg_catalog AS $$
 SELECT nullif(current_setting('app.verified_tenant_id',true),'')::uuid;
$$;
CREATE FUNCTION ai_law.actor_user() RETURNS uuid LANGUAGE sql STABLE
SET search_path=pg_catalog AS $$
 SELECT nullif(current_setting('app.verified_user_id',true),'')::uuid;
$$;

-- All security relevant mutable rows are FORCE RLS. The catalog is global
-- approved metadata and has no tenant data, so RLS is not applied to it.
ALTER TABLE ai_law.principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_law.principals FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_law.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_law.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_law.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_law.memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_law.membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_law.membership_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_law.matter_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_law.matter_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_law.matter_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_law.matter_group_members FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_law.matters ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_law.matters FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_law.matter_user_acl ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_law.matter_user_acl FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_law.matter_group_acl ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_law.matter_group_acl FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_law.iam_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_law.iam_audit FORCE ROW LEVEL SECURITY;

-- For real deployment these settings MUST be established by trusted middleware
-- in the SAME database transaction as each query. Custom PostgreSQL GUCs are
-- not signed claims and should never be exposed as a user-supplied API field.
CREATE POLICY principals_self ON ai_law.principals FOR SELECT
  USING (user_id=ai_law.actor_user() AND status='active');
CREATE POLICY tenants_scoped ON ai_law.tenants FOR SELECT
  USING (tenant_id=ai_law.actor_tenant());
CREATE POLICY memberships_scoped ON ai_law.memberships FOR SELECT USING (
    user_id=ai_law.actor_user()
    AND tenant_id=ai_law.actor_tenant()
    AND status='active' AND revoked_at IS NULL AND joined_at<=now()
);
CREATE POLICY membership_roles_scoped ON ai_law.membership_roles FOR SELECT USING (
    tenant_id=ai_law.actor_tenant() AND EXISTS(
      SELECT 1 FROM ai_law.memberships m
      WHERE m.tenant_id=membership_roles.tenant_id
        AND m.membership_id=membership_roles.membership_id
        AND m.user_id=ai_law.actor_user()
    )
);
CREATE POLICY matter_group_members_scoped ON ai_law.matter_group_members FOR SELECT USING (
    tenant_id=ai_law.actor_tenant() AND user_id=ai_law.actor_user()
    AND EXISTS(
      SELECT 1 FROM ai_law.memberships m
      WHERE m.tenant_id=matter_group_members.tenant_id
        AND m.user_id=matter_group_members.user_id
    )
);
CREATE POLICY matter_groups_scoped ON ai_law.matter_groups FOR SELECT USING (
    tenant_id=ai_law.actor_tenant() AND EXISTS (
      SELECT 1 FROM ai_law.matter_group_members gm
      WHERE gm.tenant_id=matter_groups.tenant_id
        AND gm.group_id=matter_groups.group_id AND gm.user_id=ai_law.actor_user()
    )
);
CREATE POLICY matter_user_acl_scoped ON ai_law.matter_user_acl FOR SELECT USING (
    tenant_id=ai_law.actor_tenant() AND user_id=ai_law.actor_user()
    AND EXISTS (
      SELECT 1 FROM ai_law.memberships m
      WHERE m.tenant_id=matter_user_acl.tenant_id
        AND m.user_id=matter_user_acl.user_id
    )
);
CREATE POLICY matter_group_acl_scoped ON ai_law.matter_group_acl FOR SELECT USING (
    tenant_id=ai_law.actor_tenant() AND EXISTS (
      SELECT 1 FROM ai_law.matter_group_members gm
      WHERE gm.tenant_id=matter_group_acl.tenant_id
        AND gm.group_id=matter_group_acl.group_id
        AND gm.user_id=ai_law.actor_user()
    )
);
CREATE POLICY audit_scoped ON ai_law.iam_audit FOR SELECT
  USING (tenant_id=ai_law.actor_tenant() AND user_id=ai_law.actor_user());

-- Read permission: a current explicit allow, without *any* current explicit
-- deny (user or current group), matching the matter ACL version. Neither
-- tenant_admin, platform support nor owner_user_id bypasses this.
CREATE FUNCTION ai_law.can_read_matter(tid uuid,mid uuid,uid uuid,ver bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=ai_law,pg_catalog AS $$
 SELECT
  tid=ai_law.actor_tenant() AND uid=ai_law.actor_user()
  AND EXISTS(
    SELECT 1 FROM memberships m
    WHERE m.tenant_id=tid AND m.user_id=uid AND m.status='active'
      AND m.revoked_at IS NULL AND m.joined_at<=now()
      AND EXISTS (
        SELECT 1 FROM membership_roles mr WHERE mr.tenant_id=tid
          AND mr.membership_id=m.membership_id
          AND mr.registry_version=m.role_registry_version
      )
  )
  AND EXISTS(
    SELECT 1 FROM (
      SELECT u.effect FROM matter_user_acl u
      WHERE u.tenant_id=tid AND u.matter_id=mid AND u.user_id=uid
        AND u.permission='read' AND u.acl_version=ver
        AND u.valid_from<=now() AND (u.valid_to IS NULL OR u.valid_to>now())
      UNION ALL
      SELECT g.effect FROM matter_group_acl g
      JOIN matter_group_members gm
        ON gm.tenant_id=g.tenant_id AND gm.group_id=g.group_id
      WHERE g.tenant_id=tid AND g.matter_id=mid AND gm.user_id=uid
        AND g.permission='read' AND g.acl_version=ver
        AND g.valid_from<=now() AND (g.valid_to IS NULL OR g.valid_to>now())
    ) rules WHERE rules.effect='allow'
  )
  AND NOT EXISTS(
    SELECT 1 FROM (
      SELECT u.effect FROM matter_user_acl u
      WHERE u.tenant_id=tid AND u.matter_id=mid AND u.user_id=uid
        AND u.permission='read' AND u.acl_version=ver
        AND u.valid_from<=now() AND (u.valid_to IS NULL OR u.valid_to>now())
      UNION ALL
      SELECT g.effect FROM matter_group_acl g
      JOIN matter_group_members gm
        ON gm.tenant_id=g.tenant_id AND gm.group_id=g.group_id
      WHERE g.tenant_id=tid AND g.matter_id=mid AND gm.user_id=uid
        AND g.permission='read' AND g.acl_version=ver
        AND g.valid_from<=now() AND (g.valid_to IS NULL OR g.valid_to>now())
    ) rules WHERE rules.effect='deny'
  );
$$;
CREATE POLICY matters_read_acl ON ai_law.matters FOR SELECT USING(
    tenant_id=ai_law.actor_tenant()
    AND ai_law.can_read_matter(tenant_id,matter_id,ai_law.actor_user(),acl_version)
);

-- Commit-time guard: active membership MUST have >=1 valid role in its pinned
-- registry. Match the canonical SRS invariant (not a naive immediate check).
CREATE FUNCTION ai_law.require_active_membership_role()
RETURNS trigger LANGUAGE plpgsql SET search_path=ai_law,pg_catalog AS $$
DECLARE k uuid;
BEGIN
  k := CASE WHEN TG_OP='DELETE' THEN OLD.membership_id ELSE NEW.membership_id END;
  IF EXISTS(
    SELECT 1 FROM memberships m WHERE m.membership_id=k AND m.status='active'
      AND NOT EXISTS(
        SELECT 1 FROM membership_roles mr
        JOIN role_catalog rc ON rc.role_key=mr.role_key
          AND rc.registry_version=mr.registry_version
        WHERE mr.membership_id=m.membership_id AND mr.tenant_id=m.tenant_id
          AND mr.registry_version=m.role_registry_version
      )
  ) THEN
    RAISE EXCEPTION 'active membership must have a registered role';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER active_membership_role_guard
AFTER INSERT OR UPDATE ON ai_law.memberships
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION ai_law.require_active_membership_role();
CREATE CONSTRAINT TRIGGER changed_membership_role_guard
AFTER INSERT OR UPDATE OR DELETE ON ai_law.membership_roles
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION ai_law.require_active_membership_role();

CREATE FUNCTION ai_law.member_transition_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=ai_law,pg_catalog AS $$
BEGIN
  IF OLD.status='revoked' AND NEW.status='active' THEN
    RAISE EXCEPTION 'reactivation requires separate approved and audited flow';
  END IF;
  IF (NEW.status IS DISTINCT FROM OLD.status OR
      NEW.role_registry_version IS DISTINCT FROM OLD.role_registry_version) THEN
    NEW.authz_version := GREATEST(NEW.authz_version,OLD.authz_version+1);
  END IF;
  IF NEW.authz_version<OLD.authz_version THEN
    RAISE EXCEPTION 'authz_version cannot decrease';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER member_transition_guard_before
BEFORE UPDATE ON ai_law.memberships FOR EACH ROW
EXECUTE FUNCTION ai_law.member_transition_guard();

CREATE FUNCTION ai_law.bump_member_on_role_change()
RETURNS trigger LANGUAGE plpgsql SET search_path=ai_law,pg_catalog AS $$
DECLARE mid uuid;
BEGIN
  mid:= CASE WHEN TG_OP='DELETE' THEN OLD.membership_id ELSE NEW.membership_id END;
  UPDATE memberships SET authz_version=authz_version+1 WHERE membership_id=mid;
  RETURN NULL;
END;
$$;
CREATE TRIGGER bump_member_on_role_change
AFTER INSERT OR UPDATE OR DELETE ON ai_law.membership_roles FOR EACH ROW
EXECUTE FUNCTION ai_law.bump_member_on_role_change();

CREATE FUNCTION ai_law.audit_member_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=ai_law,pg_catalog AS $$
BEGIN
  INSERT INTO iam_audit(tenant_id,membership_id,user_id,change_kind,
    old_authz_version,new_authz_version)
  VALUES(NEW.tenant_id,NEW.membership_id,NEW.user_id,TG_OP,
    CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.authz_version END,
    NEW.authz_version);
  RETURN NULL;
END;
$$;
CREATE TRIGGER audit_member_mutation
AFTER INSERT OR UPDATE ON ai_law.memberships FOR EACH ROW
EXECUTE FUNCTION ai_law.audit_member_mutation();
-- Group ACL membership changes affect authorization even when assigned
-- role keys do not change. Bump membership version to invalidate prior caches.
CREATE FUNCTION ai_law.bump_member_on_group_change()
RETURNS trigger LANGUAGE plpgsql SET search_path=ai_law,pg_catalog AS $$
DECLARE tid uuid; uid uuid;
BEGIN
  tid:= CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  uid:= CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  UPDATE memberships SET authz_version=authz_version+1
  WHERE tenant_id=tid AND user_id=uid;
  RETURN NULL;
END;
$$;
CREATE TRIGGER bump_member_on_group_change
AFTER INSERT OR UPDATE OR DELETE ON ai_law.matter_group_members
FOR EACH ROW EXECUTE FUNCTION ai_law.bump_member_on_group_change();

-- ACL mutations atomically advance matter.acl_version and remap surviving
-- ACL rows to that revision inside the same transaction. Nested trigger depth
-- prevents recursive version bumps during the internal remap. The runtime
-- application role has SELECT only, so only privileged workflow transactions
-- may change ACLs. No production-grade event outbox is claimed here.
CREATE FUNCTION ai_law.bump_matter_acl_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path=ai_law,pg_catalog AS $$
DECLARE tid uuid; mid uuid; revision bigint;
BEGIN
  IF pg_trigger_depth()>1 THEN
    RETURN NULL;
  END IF;
  tid := CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  mid := CASE WHEN TG_OP='DELETE' THEN OLD.matter_id ELSE NEW.matter_id END;
  UPDATE matters SET acl_version=acl_version+1
    WHERE tenant_id=tid AND matter_id=mid
    RETURNING acl_version INTO revision;
  IF revision IS NOT NULL THEN
    UPDATE matter_user_acl SET acl_version=revision
      WHERE tenant_id=tid AND matter_id=mid AND acl_version<>revision;
    UPDATE matter_group_acl SET acl_version=revision
      WHERE tenant_id=tid AND matter_id=mid AND acl_version<>revision;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER bump_matter_on_user_acl_change
AFTER INSERT OR UPDATE OR DELETE ON ai_law.matter_user_acl
FOR EACH ROW EXECUTE FUNCTION ai_law.bump_matter_acl_revision();
CREATE TRIGGER bump_matter_on_group_acl_change
AFTER INSERT OR UPDATE OR DELETE ON ai_law.matter_group_acl
FOR EACH ROW EXECUTE FUNCTION ai_law.bump_matter_acl_revision();
COMMIT;
