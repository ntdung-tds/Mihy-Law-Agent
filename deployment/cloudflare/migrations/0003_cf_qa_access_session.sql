-- R44 QA-only: allow verified Cloudflare Access email in session.
ALTER TABLE qa_web_sessions ADD COLUMN email TEXT;
