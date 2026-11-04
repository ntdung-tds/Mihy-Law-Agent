-- R44 NONPRODUCTION ONLY; QA password login verifier and throttling on Cloudflare D1.
-- No plaintext password, bearer tokens, private keys, legal content or OAuth in D1.
-- The existing signed-JWT-only /v1 routes remain unchanged.
CREATE TABLE IF NOT EXISTS qa_login_verifiers (
 installation_id TEXT NOT NULL,
 email TEXT NOT NULL CHECK(email=lower(email) AND length(email) BETWEEN 5 AND 254),
 user_id TEXT NOT NULL,
 subject TEXT NOT NULL,
 password_salt TEXT NOT NULL CHECK(length(password_salt)=32),
 password_hash TEXT NOT NULL CHECK(length(password_hash)=64),
 pbkdf2_iterations INTEGER NOT NULL CHECK(pbkdf2_iterations >= 100000),
 status TEXT NOT NULL CHECK(status IN ('active','disabled')),
 failures INTEGER NOT NULL DEFAULT 0 CHECK(failures BETWEEN 0 AND 5),
 locked_until INTEGER,
 PRIMARY KEY(installation_id,email),
 UNIQUE(installation_id,subject),
 FOREIGN KEY(installation_id,user_id)
   REFERENCES qa_principals(installation_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_qa_login_user ON qa_login_verifiers(installation_id,user_id);
CREATE TABLE IF NOT EXISTS qa_login_rate (
 installation_id TEXT NOT NULL,
 rate_key TEXT NOT NULL,
 window_start INTEGER NOT NULL,
 attempts INTEGER NOT NULL CHECK(attempts BETWEEN 0 AND 1000),
 PRIMARY KEY(installation_id,rate_key)
);
CREATE INDEX IF NOT EXISTS idx_qa_login_rate_cleanup ON qa_login_rate(window_start);
