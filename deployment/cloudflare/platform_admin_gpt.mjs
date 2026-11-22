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
// Calendar-valid expiry metadata: a shape-only regex accepts impossible dates (e.g. February 31).
function validExpiry(value) {
  if (value === null) return true;
  if (typeof value !== 'string' || value.length > 40) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})?)?$/.exec(value);
  if (!m) return false;
  const year=Number(m[1]), month=Number(m[2]), day=Number(m[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap=year%4===0 && (year%100!==0 || year%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if (day < 1 || day > days[month-1]) return false;
  if (m[4] === undefined) return true;
  if (+m[4]>23 || +m[5]>59 || +m[6]>59) return false;
  if (m[8] && m[8]!=='Z') {
    const hh=+m[8].slice(1,3), mm=+m[8].slice(4,6);
    if (hh>14 || mm>59 || (hh===14 && mm!==0)) return false;
  }
  return true;
}
function requireId(value) {
  if (typeof value !== 'string' || !ID.test(value)) throw new Error('PLATFORM_BAD_ID');
}
export async function listPlatformPlans(db, principal) {
  requireAdmin(principal); requireDb(db);
  const result = await db.prepare(
    'SELECT plan_id, plan_name, status, max_users, max_storage_bytes FROM platform_service_plans ORDER BY plan_id LIMIT 101'
  ).all();
  if (result?.success !== true || !Array.isArray(result?.results) || result.results.length > 100) throw new Error('PLATFORM_INVALID_RESULT');
  const seenPlanIds = new Set();
  return result.results.map(row => {
    if (!row || typeof row.plan_id !== 'string' || !ID.test(row.plan_id) ||
        typeof row.plan_name !== 'string' || row.plan_name.trim().length === 0 || row.plan_name.length > 120 ||
        !['active', 'retired'].includes(row.status) ||
        !Number.isSafeInteger(row.max_users) || row.max_users < 1 ||
        !Number.isSafeInteger(row.max_storage_bytes) || row.max_storage_bytes < 0)
      throw new Error('PLATFORM_INVALID_RESULT');
    if (seenPlanIds.has(row.plan_id)) throw new Error('PLATFORM_INVALID_RESULT');
    seenPlanIds.add(row.plan_id);
    return {plan_id:row.plan_id, plan_name:row.plan_name, status:row.status,
      max_users:row.max_users, max_storage_bytes:row.max_storage_bytes};
  });
}
export async function changeTenantService(db, principal, input) {
  requireAdmin(principal); requireDb(db);
  // The service boundary must reject unexpected keys even when a caller bypasses HTTP.
  // Do not accept arrays, inherited properties, symbols or prototype-manipulated objects.
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input)) ||
      Reflect.ownKeys(input).length !== 4 ||
      !['tenantId','status','auditId','reasonCode'].every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        // Accessor properties can execute arbitrary caller code during destructuring.
        // Only accept own, enumerable, writable data properties at this boundary.
        return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') &&
          descriptor.enumerable === true && descriptor.writable === true;
      }))
    throw new Error('PLATFORM_BAD_INPUT');
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
  // D1 must return a complete, successful result for BOTH statements.
  // Missing/partial batch metadata is an infrastructure failure, not a no-op.
  if (!Array.isArray(results) || results.length !== 2 ||
      results.some(item => !item || item.success !== true ||
        !Number.isSafeInteger(item.meta?.changes) || item.meta.changes < 0))
    throw new Error('PLATFORM_BATCH_INCOMPLETE');
  if (results[0].meta.changes !== 1) {
    if (results[0].meta.changes !== 0 || results[1].meta.changes !== 0)
      throw new Error('PLATFORM_BATCH_INCOMPLETE');
    return {changed:false};
  }
  // Never report a successful service mutation without exactly one durable audit row.
  // A zero-row INSERT can otherwise silently succeed while leaving an unaudited change.
  if (results?.[1]?.meta?.changes !== 1) throw new Error('PLATFORM_AUDIT_INCOMPLETE');
  return {changed:true, tenantId, status};
}

// Fetch one extra row so an oversized result cannot silently masquerade as a complete list.
// R219: System Admin control-plane list for the mobile view; explicit metadata allowlist.
// Caller must provide a verified server-side principal. Never SELECT * or join tenant data.
export async function listTenantServices(db, principal) {
  requireAdmin(principal); requireDb(db);
  const result = await db.prepare(
    'SELECT tenant_id, plan_id, service_status, license_expires_at FROM platform_tenant_services ORDER BY tenant_id LIMIT 101'
  ).all();
  if (result?.success !== true || !Array.isArray(result?.results) || result.results.length > 100)
    throw new Error('PLATFORM_INVALID_RESULT');
  const seenTenantIds = new Set();
  return result.results.map(row => {
    if (!row || typeof row.tenant_id !== 'string' || !ID.test(row.tenant_id) ||
        typeof row.plan_id !== 'string' || !ID.test(row.plan_id) ||
        !STATUS.has(row.service_status) ||
        !validExpiry(row.license_expires_at))
      throw new Error('PLATFORM_INVALID_RESULT');
    if (seenTenantIds.has(row.tenant_id)) throw new Error('PLATFORM_INVALID_RESULT');
    seenTenantIds.add(row.tenant_id);
    return {tenant_id:row.tenant_id, plan_id:row.plan_id,
      service_status:row.service_status, license_expires_at:row.license_expires_at};
  });
}
