// R217: metadata-only platform service boundary. Not an HTTP authentication adapter.
// Caller MUST supply principal from verified server-side session, never request JSON.
const STATUS = new Set(['pending','active','suspended','revoked']);
const ACTION = {active:'service_activate',suspended:'service_suspend',revoked:'service_revoke'};
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/;
function requireAdmin(principal) {
  if (!principal || principal.verified !== true || principal.kind !== 'system_admin' ||
      typeof principal.id !== 'string' || !ID.test(principal.id) ||
      principal.impersonating === true) throw new Error('PLATFORM_FORBIDDEN');
}
function requireDb(db) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function')
    throw new Error('PLATFORM_DB_UNAVAILABLE');
}
function requireId(value) {
  if (typeof value !== 'string' || !ID.test(value)) throw new Error('PLATFORM_BAD_ID');
}
export async function listPlatformPlans(db, principal) {
  requireAdmin(principal); requireDb(db);
  const result = await db.prepare(
    'SELECT plan_id, plan_name, status, max_users, max_storage_bytes FROM platform_service_plans ORDER BY plan_id LIMIT 100'
  ).all();
  return result.results ?? [];
}
export async function changeTenantService(db, principal, input) {
  requireAdmin(principal); requireDb(db);
  if (!input || typeof input !== 'object') throw new Error('PLATFORM_BAD_INPUT');
  const {tenantId, status, auditId, reasonCode} = input;
  requireId(tenantId); requireId(auditId);
  if (!STATUS.has(status) || status === 'pending') throw new Error('PLATFORM_BAD_STATUS');
  if (typeof reasonCode !== 'string' || !/^[A-Z][A-Z0-9_]{1,79}$/.test(reasonCode))
    throw new Error('PLATFORM_BAD_REASON');
  // Revoked services cannot be reactivated; update and audit are a single D1 batch.
  const update = db.prepare(
    'UPDATE platform_tenant_services SET service_status = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND service_status != ? AND service_status != ?'
  ).bind(status, tenantId, 'revoked', status);
  const audit = db.prepare(
    'INSERT INTO platform_admin_audit(audit_id, actor_id, tenant_id, action, reason_code) SELECT ?, ?, ?, ?, ? WHERE changes() = 1'
  ).bind(auditId, principal.id, tenantId, ACTION[status], reasonCode);
  // D1 batch transactions roll back together on SQL error. Never expose tenant business data.
  const results = await db.batch([update, audit]);
  if (results?.[0]?.meta?.changes !== 1) return {changed:false};
  return {changed:true, tenantId, status};
}
