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
  if (!Array.isArray(result?.results) || result.results.length > 100) throw new Error('PLATFORM_INVALID_RESULT');
  return result.results.map(row => {
    if (!row || typeof row.plan_id !== 'string' || !ID.test(row.plan_id) ||
        typeof row.plan_name !== 'string' || row.plan_name.trim().length === 0 || row.plan_name.length > 120 ||
        !['active', 'retired'].includes(row.status) ||
        !Number.isSafeInteger(row.max_users) || row.max_users < 1 ||
        !Number.isSafeInteger(row.max_storage_bytes) || row.max_storage_bytes < 0)
      throw new Error('PLATFORM_INVALID_RESULT');
    return {plan_id:row.plan_id, plan_name:row.plan_name, status:row.status,
      max_users:row.max_users, max_storage_bytes:row.max_storage_bytes};
  });
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
  // Never report a successful service mutation without exactly one durable audit row.
  // A zero-row INSERT can otherwise silently succeed while leaving an unaudited change.
  if (results?.[1]?.meta?.changes !== 1) throw new Error('PLATFORM_AUDIT_INCOMPLETE');
  return {changed:true, tenantId, status};
}

// R219: System Admin control-plane list for the mobile view; explicit metadata allowlist.
// Caller must provide a verified server-side principal. Never SELECT * or join tenant data.
export async function listTenantServices(db, principal) {
  requireAdmin(principal); requireDb(db);
  const result = await db.prepare(
    'SELECT tenant_id, plan_id, service_status, license_expires_at FROM platform_tenant_services ORDER BY tenant_id LIMIT 100'
  ).all();
  if (!Array.isArray(result?.results)) throw new Error('PLATFORM_INVALID_RESULT');
  return result.results.map(row => ({
    tenant_id: typeof row?.tenant_id === 'string' ? row.tenant_id : null,
    plan_id: typeof row?.plan_id === 'string' ? row.plan_id : null,
    service_status: typeof row?.service_status === 'string' ? row.service_status : null,
    license_expires_at: typeof row?.license_expires_at === 'string' ? row.license_expires_at : null
  }));
}
