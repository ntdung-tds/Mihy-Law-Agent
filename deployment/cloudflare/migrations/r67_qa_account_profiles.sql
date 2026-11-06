-- R67 QA-only personal account profile. Owner-requested account center; no production rollout.
-- Identity & tenant authorization remain owned by qa_principals / qa_memberships.
-- plan_code is administrator-assigned informational metadata; never an authorization gate.
CREATE TABLE IF NOT EXISTS qa_account_profiles (
  installation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  job_title TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  avatar_data TEXT NOT NULL DEFAULT '',
  plan_code TEXT NOT NULL DEFAULT 'demo' CHECK (plan_code IN ('demo','pro')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (installation_id, user_id),
  FOREIGN KEY (installation_id, user_id) REFERENCES qa_principals(installation_id,user_id)
    ON DELETE CASCADE,
  CHECK (length(display_name) <= 80),
  CHECK (length(phone) <= 24),
  CHECK (length(job_title) <= 100),
  CHECK (length(bio) <= 400),
  CHECK (length(avatar_data) <= 48000)
);
-- No seed of real names, email addresses, credentials or customer legal data.
