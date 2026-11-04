-- R38 isolated LOCAL PASSWORD AUTH TEST FIXTURE ONLY.
-- NOT the approved SRS canonical account/provider/migration design.
-- Never apply to real client or production databases.
CREATE TABLE ai_law_nonprod.password_accounts (
  email TEXT PRIMARY KEY
    CHECK (email = lower(email) AND length(email) BETWEEN 5 AND 254),
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES ai_law.principals(user_id),
  password_hash TEXT NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
  status TEXT NOT NULL CHECK (status IN ('active','disabled')),
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
  locked_until TIMESTAMPTZ,
  UNIQUE (issuer,subject),
  FOREIGN KEY (issuer,subject)
    REFERENCES ai_law_nonprod.identities(issuer,subject)
);
-- No plaintext password and no implicit tenant-admin matter permissions.
-- Password account DB access is isolated to the separate auth container.
