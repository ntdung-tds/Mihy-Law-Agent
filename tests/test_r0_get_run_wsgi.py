"""R28 GET /v1/runs/{id}: synthetic WSGI HTTP/API contract + security tests.

No real user, actual JWT provider, RLS database or production services.
"""
import json
from dataclasses import replace
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from wsgiref.simple_server import make_server, WSGIRequestHandler

from r0_core.membership_repository import PostgresMembershipRepository
from r0_core.run_read_wsgi import GetRunWSGI, RunSnapshot
from r0_core.session_boundary import (
    VerifiedBearerIdentity, SessionDependencyUnavailable, authenticate_bearer_session,
)
from r0_core.tenant_context import AuthenticatedPrincipal

U = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
ISS = "https://idp.example.invalid"
AUD = "ai-law-api"
SID = "synthetic-session-A"
NOW = 1800000000
RUN1 = "run-123"
PAYLOAD = {
    "run_id": RUN1, "status": "queued",
    "input_snapshot_id": "synthetic-snapshot-v1",
    "policy_version": "synthetic-policy-v1",
}


class Cursor:
    def __init__(self, get_rows):
        self.get_rows = get_rows
        self.rows = []
        self.closed = False

    def execute(self, statement, args):
        assert "m.tenant_id = CAST(%s AS UUID)" in statement
        assert "m.revoked_at IS NULL" in statement
        self.rows = self.get_rows(*args[:2])

    def fetchall(self):
        return self.rows

    def close(self):
        self.closed = True


class Connection:
    def __init__(self, rows):
        self.cursor_instance = Cursor(rows)
        self.closed = False

    def cursor(self):
        return self.cursor_instance

    def close(self):
        self.closed = True


class QuietHandler(WSGIRequestHandler):
    def log_message(self, format, *args):
        pass


class RunReadBatchTests(unittest.TestCase):
    def setUp(self):
        self.verified = VerifiedBearerIdentity(
            issuer=ISS, subject="ext-subject", audience=(AUD,),
            session_id=SID, issued_at=NOW-100,
            not_before=NOW-100, expires_at=NOW+100,
        )
        self.principal = AuthenticatedPrincipal(user_id=U, status="active")
        self.session_live = True
        self.active_tenant = A
        self.roles_live = True
        self.acl = True
        self.run = RunSnapshot(tenant_id=A, run_id=RUN1, data=PAYLOAD.copy())
        self.connection_count = 0
        self.load_count = 0
        self.acl_count = 0
        self.session_tenant_count = 0
        self.verifier_count = 0
        self.fail_dependency = None

    def verify(self, token):
        self.verifier_count += 1
        if self.fail_dependency == "known_idp":
            raise SessionDependencyUnavailable("provider secret outage")
        if self.fail_dependency == "verify" or token != "synthetic-signed":
            raise RuntimeError("secret idp error")
        return self.verified

    def resolve(self, issuer, subject):
        if self.fail_dependency == "known_identity_store":
            raise SessionDependencyUnavailable("identity store secret")
        self.assertEqual((issuer, subject), (ISS, "ext-subject"))
        return self.principal

    def session_check(self, uid, sid):
        if self.fail_dependency == "known_session_store":
            raise SessionDependencyUnavailable("session db secret")
        self.assertEqual(sid, SID)
        self.assertEqual(uid, U)
        return self.session_live

    def tenant_by_session(self, uid, sid):
        self.session_tenant_count += 1
        if self.fail_dependency == "session_tenant":
            raise RuntimeError("session tenant secret failure")
        self.assertEqual((uid, sid), (U, SID))
        return self.active_tenant

    def connection(self):
        self.connection_count += 1
        def rows(uid, tenant):
            if self.fail_dependency == "database":
                raise RuntimeError("database private credentials")
            if uid == U and tenant == A and self.roles_live:
                return [(U, A, "active", 1, "1.1.15", "personal", "lawyer")]
            return []
        return Connection(rows)

    def acl_check(self, tenant, uid, run):
        self.acl_count += 1
        if self.fail_dependency == "acl":
            raise RuntimeError("ACL server private path")
        self.assertEqual((tenant, uid), (A, U))
        return self.acl if run == RUN1 else False

    def load(self, tenant, run_id):
        self.load_count += 1
        if self.fail_dependency == "load":
            raise RuntimeError("run private backend path")
        self.assertEqual((tenant, run_id), (A, RUN1))
        return self.run

    def app(self):
        return GetRunWSGI(
            token_verifier=self.verify,
            identity_lookup=self.resolve,
            session_is_active=self.session_check,
            active_tenant_for_session=self.tenant_by_session,
            membership_repository=PostgresMembershipRepository(
                open_connection=self.connection,
                approved_registry_version="1.1.15",
            ),
            authorize_run_read=self.acl_check,
            load_run=self.load,
            expected_issuer=ISS,
            expected_audience=AUD,
            now_epoch=lambda: NOW,
        )

    def request(self, app=None, path="/v1/runs/run-123",
                method="GET", header="Bearer synthetic-signed", query="", extra_env=None):
        from io import BytesIO
        status_box = {}
        env = {
            "REQUEST_METHOD": method, "PATH_INFO": path, "QUERY_STRING": query,
            "wsgi.input": BytesIO(), "wsgi.version": (1, 0),
            "wsgi.url_scheme": "http", "wsgi.errors": BytesIO(),
            "wsgi.multithread": False, "wsgi.multiprocess": False,
            "wsgi.run_once": False,
        }
        if header is not None:
            env["HTTP_AUTHORIZATION"] = header
        if extra_env:
            env.update(extra_env)
        def start(status, headers, _exc_info=None):
            status_box["status"] = int(status.split()[0])
            status_box["headers"] = dict(headers)
        output = b"".join((app or self.app())(env, start))
        return status_box["status"], json.loads(output), status_box["headers"]

    def test_auth_session_returns_only_server_verified_session(self):
        session = authenticate_bearer_session(
            authorization_header="Bearer synthetic-signed",
            token_verifier=self.verify, identity_lookup=self.resolve,
            session_is_active=self.session_check,
            expected_issuer=ISS, expected_audience=AUD, now_epoch=NOW,
        )
        self.assertEqual(session.principal.user_id, U)
        self.assertEqual(session.session_id, SID)

    def test_successful_get_run_exact_schema_fields(self):
        code, obj, headers = self.request()
        self.assertEqual(code, 200)
        self.assertEqual(obj, PAYLOAD)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual((self.connection_count, self.acl_count, self.load_count), (1,1,1))

    def test_missing_or_invalid_bearer_401_precedes_every_lookup(self):
        for header in (None, "", "Bearer invalid", "Basic other"):
            with self.subTest(header=header):
                before = (self.session_tenant_count, self.connection_count,
                          self.acl_count, self.load_count)
                code, obj, _ = self.request(header=header)
                self.assertEqual(code, 401)
                self.assertEqual(before,
                    (self.session_tenant_count, self.connection_count,
                     self.acl_count, self.load_count))
                self.assertEqual(set(obj), {"code","message","correlation_id","retryable"})

    def test_expired_and_wrong_audience_401(self):
        for override in ({"expires_at": NOW-1}, {"audience": ("another-api",)}):
            with self.subTest(override=override):
                self.verified = replace(self.verified, **override)
                self.assertEqual(self.request()[0], 401)
                self.verified = replace(self.verified, expires_at=NOW+100, audience=(AUD,))

    def test_revoked_session_401_without_tenant_or_run_access(self):
        self.session_live = False
        self.assertEqual(self.request()[0], 401)
        self.assertEqual((self.session_tenant_count, self.acl_count, self.load_count),
                         (0, 0, 0))

    def test_tenant_from_server_session_not_untrusted_header(self):
        self.active_tenant = B
        code, obj, _ = self.request()
        self.assertEqual(code, 404)
        self.assertEqual(self.acl_count, 0)
        self.assertEqual(self.load_count, 0)
        self.assertNotIn(B, json.dumps(obj))

    def test_no_membership_or_invalid_session_tenant_is_masked_404(self):
        for value in ("cccccccc-cccc-4ccc-8ccc-cccccccccccc", None, "fake-tenant"):
            with self.subTest(value=value):
                self.active_tenant = value
                code, body, _ = self.request()
                self.assertEqual(code, 404)
                self.assertNotIn("tenant", body["message"].lower())
        self.active_tenant = A
        self.roles_live = False
        self.assertEqual(self.request()[0], 404)

    def test_run_acl_denied_and_nonexistent_are_identical_404(self):
        self.acl = False
        first = self.request()
        self.acl = True
        second = self.request(path="/v1/runs/unknown-run")
        for response in (first, second):
            self.assertEqual(response[0], 404)
        self.assertEqual(first[1]["code"], second[1]["code"])
        self.assertEqual(first[1]["message"], second[1]["message"])
        self.assertEqual(self.load_count, 0)

    def test_wrong_tenant_run_from_dependency_is_not_exposed(self):
        self.run = RunSnapshot(tenant_id=B, run_id=RUN1, data=PAYLOAD.copy())
        code, body, _ = self.request()
        self.assertEqual(code, 404)
        self.assertNotIn("synthetic-snapshot-v1", json.dumps(body))

    def test_wrong_run_id_in_store_denied(self):
        self.run = RunSnapshot(tenant_id=A, run_id="different", data=PAYLOAD.copy())
        self.assertEqual(self.request()[0], 404)

    def test_no_leak_on_dependency_failure(self):
        for dependency in ("session_tenant", "acl", "load", "database"):
            with self.subTest(dependency=dependency):
                self.fail_dependency = dependency
                code, body, _ = self.request()
                self.assertIn(code, (404, 503))
                self.assertNotIn("private", json.dumps(body))
                self.assertNotIn("credentials", json.dumps(body))
        self.fail_dependency = None

    def test_error_envelope_contract_and_distinct_correlation_ids(self):
        a = self.request(header=None)
        b = self.request(header=None)
        self.assertEqual(a[0], 401)
        self.assertEqual(set(a[1]), {"code","message","correlation_id","retryable"})
        self.assertIs(a[1]["retryable"], False)
        self.assertNotEqual(a[1]["correlation_id"], b[1]["correlation_id"])

    def test_error_bad_request_framing_400(self):
        for path,query in [("/v1/runs/ ", ""), ("/v1/runs/run-123", "unknown=true")]:
            with self.subTest(path=path, query=query):
                self.assertEqual(self.request(path=path, query=query)[0], 400)

    def test_other_routes_not_implemented(self):
        for method, path in (("POST","/v1/runs/run-123"),
                             ("GET","/v1/tenant-switch"),
                             ("GET","/v1/runs/run-123/cancel")):
            with self.subTest(method=method,path=path):
                self.assertEqual(self.request(method=method, path=path)[0], 404)

    def test_membership_database_unavailable_503_not_fake_not_found(self):
        self.fail_dependency = "database"
        code, body, _ = self.request()
        self.assertEqual(code, 503)
        self.assertEqual(body["code"], "DEPENDENCY_UNAVAILABLE")
        self.assertIs(body["retryable"], True)
        self.assertNotIn("credentials", json.dumps(body))
        self.assertEqual(self.acl_count, 0)

    def test_long_nonblank_run_id_is_contract_valid_not_framing_400(self):
        # OpenAPI says minLength:1 and non-whitespace; no 256-byte maximum.
        code, _, _ = self.request(path="/v1/runs/" + "r" * 300)
        self.assertEqual(code, 404)  # unauthorized run, not malformed framing

    def test_strict_acl_true_bool_not_truthy_one(self):
        self.acl = 1
        code, body, _ = self.request()
        self.assertEqual(code, 404)
        self.assertEqual(self.load_count, 0)

    def test_outage_retryable_is_only_dependency_failure(self):
        self.fail_dependency = "acl"
        code, body, _ = self.request()
        self.assertEqual(code, 503)
        self.assertIs(body["retryable"], True)
        self.fail_dependency = None
        self.acl = False
        code, body, _ = self.request()
        self.assertEqual(code, 404)
        self.assertIs(body["retryable"], False)

    def test_known_upstream_auth_outage_returns_retryable_503(self):
        # Generic invalid-token errors remain 401; only an explicitly typed
        # trusted service outage is a 503 (does not expose backend details).
        for kind in ("known_idp", "known_identity_store", "known_session_store"):
            with self.subTest(kind=kind):
                self.fail_dependency = kind
                code, body, _ = self.request()
                self.assertEqual(code, 503)
                self.assertEqual(body["code"], "DEPENDENCY_UNAVAILABLE")
                self.assertIs(body["retryable"], True)
                self.assertNotIn("secret", json.dumps(body))
                self.assertEqual(self.connection_count, 0)
        self.fail_dependency = None

    def test_untrusted_tenant_header_cannot_change_server_session_scope(self):
        code, body, _ = self.request(
            extra_env={"HTTP_X_TENANT_ID": B, "HTTP_X_USER_ID": OTHER}
        )
        self.assertEqual(code, 200)
        self.assertEqual(body["run_id"], RUN1)
        self.assertEqual((self.connection_count, self.acl_count), (1, 1))
        self.active_tenant = B
        code, _, _ = self.request(extra_env={"HTTP_X_TENANT_ID": A})
        self.assertEqual(code, 404)

    def test_fresh_membership_on_each_request_no_cached_access(self):
        self.assertEqual(self.request()[0], 200)
        self.roles_live = False
        self.assertEqual(self.request()[0], 404)
        self.assertEqual(self.connection_count, 2)
        self.assertEqual(self.load_count, 1)

    def test_invalid_run_response_fails_closed(self):
        for payload in (
            {**PAYLOAD, "secret_admin_flag": "do-not-return"},
            {**PAYLOAD, "status": "succeeded"},
            {**PAYLOAD, "status": "partial"},
            {**PAYLOAD, "status": "bogus"},
            {**PAYLOAD, "run_id": "another"},
        ):
            with self.subTest(payload=payload):
                self.run = RunSnapshot(tenant_id=A, run_id=RUN1, data=payload)
                code, result, _ = self.request()
                self.assertEqual(code, 503)
                self.assertNotIn("secret_admin_flag", json.dumps(result))

    def test_openapi_optional_objects_cannot_be_explicit_null(self):
        # TaskRun.coverage and TaskRun.usage are optional objects, not nullable.
        for key in ("coverage", "usage"):
            with self.subTest(key=key):
                self.run = RunSnapshot(tenant_id=A, run_id=RUN1,
                                       data={**PAYLOAD, key: None})
                code, _, _ = self.request()
                self.assertEqual(code, 503)

    def test_valid_succeeded_and_partial_contracts(self):
        valid = [
            {**PAYLOAD, "status":"succeeded", "result_version_id":"result-v1",
             "coverage":{"status":"complete"}, "usage":{"reconciliation_status":"reconciled"}},
            {**PAYLOAD, "status":"partial", "coverage":{"status":"partial"},
             "usage":{"reconciliation_status":"estimated"}},
        ]
        for payload in valid:
            with self.subTest(status=payload["status"]):
                self.run = RunSnapshot(tenant_id=A, run_id=RUN1, data=payload)
                self.assertEqual(self.request()[0], 200)

    def test_real_loopback_http_statuses_in_one_run(self):
        """Actual HTTP server with fake verifier/stores; no cloud/real IdP."""
        with make_server("127.0.0.1", 0, self.app(),
                         handler_class=QuietHandler) as srv:
            worker = threading.Thread(target=srv.serve_forever, daemon=True)
            worker.start()
            try:
                url = "http://127.0.0.1:%d/v1/runs/run-123" % srv.server_port
                response = urlopen(Request(url, headers={
                    "Authorization":"Bearer synthetic-signed"}), timeout=5)
                with response:
                    self.assertEqual(response.status, 200)
                    self.assertEqual(json.load(response), PAYLOAD)
                self.session_live = False
                with self.assertRaises(HTTPError) as e:
                    urlopen(Request(url, headers={"Authorization":"Bearer synthetic-signed"}),timeout=5)
                self.assertEqual(e.exception.code, 401)
                self.session_live = True
                self.acl = False
                with self.assertRaises(HTTPError) as e:
                    urlopen(Request(url, headers={"Authorization":"Bearer synthetic-signed"}),timeout=5)
                self.assertEqual(e.exception.code, 404)
            finally:
                srv.shutdown()
                worker.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
