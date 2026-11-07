-- Several families per install (D20). One account is one family (D11);
-- users.id stays the tenant key every table is scoped by. Families are
-- onboarded on the CLI only (bin/console user:create sends an invite mail).

-- A locked family can't log in; its sessions, keys and pairing links stop working.
ALTER TABLE users ADD COLUMN disabled_at DATETIME NULL AFTER email_verified_at;

-- Invite mails reuse the reset-token machinery with a longer validity.
ALTER TABLE password_resets ADD COLUMN purpose ENUM('reset','invite') NOT NULL DEFAULT 'reset' AFTER user_id;

ALTER TABLE sessions MODIFY COLUMN via ENUM('password','pairing','reset','register','invite') NOT NULL;

-- Wrong pairing codes are now counted per IP and globally (rate_limits),
-- not on the links: a typo in one family no longer spends another family's code.
ALTER TABLE device_links DROP COLUMN attempts;
