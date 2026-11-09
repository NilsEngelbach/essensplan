-- The family's AI provider when the server has several (D25). NULL or one
-- that is no longer configured = the server's default (AI_PROVIDER).
ALTER TABLE users
  ADD COLUMN ai_provider VARCHAR(20) NULL AFTER planning_weekday;
