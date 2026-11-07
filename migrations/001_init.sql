-- Essensplan schema, first version.
-- MySQL 8 and MariaDB 10.6+: utf8mb4_unicode_ci everywhere (accent- and
-- case-insensitive search on both), JSON columns, CHECK constraints.
-- Timestamps are UTC DATETIME; plan dates are Europe/Berlin calendar days.

CREATE TABLE users (
  id                VARCHAR(36)  NOT NULL PRIMARY KEY,
  name              VARCHAR(100) NOT NULL,
  email             VARCHAR(190) NOT NULL,
  password_hash     VARCHAR(255) NOT NULL,
  email_verified_at DATETIME     NULL,
  week_start        TINYINT      NOT NULL DEFAULT 1,
  planning_weekday  TINYINT      NOT NULL DEFAULT 5,
  section_order     JSON         NULL,
  created_at        DATETIME     NOT NULL,
  updated_at        DATETIME     NOT NULL,
  UNIQUE KEY users_email (email),
  CONSTRAINT users_week_start CHECK (week_start BETWEEN 0 AND 6),
  CONSTRAINT users_planning_weekday CHECK (planning_weekday BETWEEN 0 AND 6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per logged-in device (D19). The cookie value is never stored.
CREATE TABLE sessions (
  id           VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id      VARCHAR(36)  NOT NULL,
  token_hash   CHAR(64)     NOT NULL,
  csrf_token   CHAR(64)     NOT NULL,
  remember     TINYINT(1)   NOT NULL DEFAULT 1,
  device_label VARCHAR(60)  NOT NULL,
  user_agent   VARCHAR(500) NULL,
  ip           VARCHAR(45)  NULL,
  via          ENUM('password','pairing','reset','register') NOT NULL,
  created_at   DATETIME     NOT NULL,
  last_seen_at DATETIME     NOT NULL,
  expires_at   DATETIME     NOT NULL,
  UNIQUE KEY sessions_token (token_hash),
  KEY sessions_user (user_id, last_seen_at),
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pairing a new device with a logged-in one: 6-digit code or QR token.
CREATE TABLE device_links (
  id                 VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id            VARCHAR(36) NOT NULL,
  code_hash          CHAR(64)    NOT NULL,
  token_hash         CHAR(64)    NOT NULL,
  created_by_session VARCHAR(36) NULL,
  attempts           TINYINT     NOT NULL DEFAULT 0,
  created_at         DATETIME    NOT NULL,
  expires_at         DATETIME    NOT NULL,
  used_at            DATETIME    NULL,
  used_by_session    VARCHAR(36) NULL,
  used_by_label      VARCHAR(60) NULL,
  spent_at           DATETIME    NULL,
  UNIQUE KEY device_links_token (token_hash),
  KEY device_links_code (code_hash),
  KEY device_links_user (user_id),
  CONSTRAINT device_links_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE password_resets (
  id         VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id    VARCHAR(36) NOT NULL,
  token_hash CHAR(64)    NOT NULL,
  created_at DATETIME    NOT NULL,
  expires_at DATETIME    NOT NULL,
  used_at    DATETIME    NULL,
  UNIQUE KEY password_resets_token (token_hash),
  KEY password_resets_user (user_id),
  CONSTRAINT password_resets_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rate_limits (
  bucket         VARCHAR(190) NOT NULL PRIMARY KEY,
  hits           INT          NOT NULL,
  window_start   DATETIME     NOT NULL,
  window_seconds INT          NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE recipes (
  id           VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id      VARCHAR(36)  NOT NULL,
  title        VARCHAR(200) NOT NULL,
  description  TEXT         NULL,
  image_path   VARCHAR(500) NULL,
  category     VARCHAR(30)  NOT NULL,
  tags         JSON         NOT NULL,
  cooking_time SMALLINT     NULL,
  servings     TINYINT      NULL,
  difficulty   VARCHAR(10)  NULL,
  rating       TINYINT      NULL,
  source_url   VARCHAR(1000) NULL,
  created_via  ENUM('app','import','api','mcp') NOT NULL DEFAULT 'app',
  created_at   DATETIME     NOT NULL,
  updated_at   DATETIME(6)  NOT NULL,
  deleted_at   DATETIME     NULL,
  KEY recipes_user (user_id, deleted_at, created_at),
  FULLTEXT KEY recipes_text (title, description),
  CONSTRAINT recipes_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT recipes_rating CHECK (rating IS NULL OR rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ingredients (
  id        VARCHAR(36)   NOT NULL PRIMARY KEY,
  recipe_id VARCHAR(36)   NOT NULL,
  position  SMALLINT      NOT NULL,
  name      VARCHAR(200)  NOT NULL,
  amount    DECIMAL(10,3) NULL,
  unit      VARCHAR(30)   NULL,
  notes     VARCHAR(300)  NULL,
  component VARCHAR(100)  NULL,
  section   VARCHAR(40)   NULL,
  KEY ingredients_recipe (recipe_id, position),
  KEY ingredients_name (name),
  CONSTRAINT ingredients_recipe_fk FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE instructions (
  id             VARCHAR(36)  NOT NULL PRIMARY KEY,
  recipe_id      VARCHAR(36)  NOT NULL,
  step_number    SMALLINT     NOT NULL,
  description    TEXT         NOT NULL,
  image_path     VARCHAR(500) NULL,
  ingredient_ids JSON         NULL,
  KEY instructions_recipe (recipe_id, step_number),
  CONSTRAINT instructions_recipe_fk FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fixed global set (D7), seeded below.
CREATE TABLE meal_slots (
  id         TINYINT     NOT NULL PRIMARY KEY,
  slot_key   VARCHAR(20) NOT NULL,
  name       VARCHAR(40) NOT NULL,
  short_name VARCHAR(20) NOT NULL,
  position   TINYINT     NOT NULL,
  UNIQUE KEY meal_slots_key (slot_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO meal_slots (id, slot_key, name, short_name, position) VALUES
  (1, 'breakfast', 'Frühstück',   'Früh',   1),
  (2, 'lunch',     'Mittagessen', 'Mittag', 2),
  (3, 'dinner',    'Abendessen',  'Abend',  3),
  (4, 'snack',     'Snack',       'Snack',  4);

-- A plan entry is a recipe or free text, never both (D15). No servings.
-- recipe_id has no FK action: MySQL forbids a CHECK on a column used in one.
-- The app detaches entries (note = title) before a recipe goes away.
CREATE TABLE meal_plan_entries (
  id                 VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id            VARCHAR(36) NOT NULL,
  date               DATE        NOT NULL,
  meal_slot_id       TINYINT     NOT NULL,
  recipe_id          VARCHAR(36) NULL,
  note               VARCHAR(80) NULL,
  detached_recipe_id VARCHAR(36) NULL,
  position           SMALLINT    NOT NULL DEFAULT 0,
  created_via        ENUM('app','api','mcp') NOT NULL DEFAULT 'app',
  seen_at            DATETIME    NULL,
  created_at         DATETIME(6) NOT NULL,
  updated_at         DATETIME(6) NOT NULL,
  deleted_at         DATETIME    NULL,
  KEY entries_user_date (user_id, date),
  KEY entries_recipe (recipe_id),
  KEY entries_detached (detached_recipe_id),
  CONSTRAINT entries_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT entries_slot_fk FOREIGN KEY (meal_slot_id) REFERENCES meal_slots (id),
  CONSTRAINT entries_recipe_fk FOREIGN KEY (recipe_id) REFERENCES recipes (id),
  CONSTRAINT entries_recipe_xor_note CHECK ((recipe_id IS NULL) <> (note IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Einkauf (D16). Plan-derived lines are computed live and never stored.
CREATE TABLE shopping_trips (
  id           VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id      VARCHAR(36) NOT NULL,
  days         JSON        NOT NULL,
  days_chosen  TINYINT(1)  NOT NULL DEFAULT 0,
  created_at   DATETIME(6) NOT NULL,
  completed_at DATETIME    NULL,
  KEY trips_user (user_id, completed_at),
  CONSTRAINT trips_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- NULL checked / at_home = never touched (an untouched trip follows the plan).
CREATE TABLE shopping_item_state (
  trip_id    VARCHAR(36)  NOT NULL,
  line_key   VARCHAR(190) COLLATE utf8mb4_bin NOT NULL,
  checked    TINYINT(1)   NULL,
  at_home    TINYINT(1)   NULL,
  seen_at    DATETIME     NULL,
  updated_at DATETIME     NOT NULL,
  PRIMARY KEY (trip_id, line_key),
  CONSTRAINT item_state_trip_fk FOREIGN KEY (trip_id) REFERENCES shopping_trips (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE shopping_manual_items (
  id             VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id        VARCHAR(36) NOT NULL,
  name           VARCHAR(60) NOT NULL,
  section        VARCHAR(40) NOT NULL,
  created_via    ENUM('app','api','mcp') NOT NULL DEFAULT 'app',
  created_at     DATETIME(6) NOT NULL,
  bought_at      DATETIME    NULL,
  bought_trip_id VARCHAR(36) NULL,
  deleted_at     DATETIME    NULL,
  KEY manual_user (user_id, bought_at, deleted_at),
  CONSTRAINT manual_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE section_overrides (
  user_id  VARCHAR(36)  NOT NULL,
  name_key VARCHAR(190) COLLATE utf8mb4_bin NOT NULL,
  section  VARCHAR(40)  NOT NULL,
  PRIMARY KEY (user_id, name_key),
  CONSTRAINT overrides_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- How often a name was marked "da": from 2 on it prints as "meist da".
CREATE TABLE shopping_home_counts (
  user_id  VARCHAR(36)  NOT NULL,
  name_key VARCHAR(190) COLLATE utf8mb4_bin NOT NULL,
  count    INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, name_key),
  CONSTRAINT home_counts_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE api_keys (
  id           VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id      VARCHAR(36) NOT NULL,
  name         VARCHAR(60) NOT NULL,
  prefix       CHAR(12)    NOT NULL,
  key_hash     CHAR(64)    NOT NULL,
  scopes       JSON        NOT NULL,
  client       ENUM('claude-code','claude-desktop','mcp','rest') NOT NULL DEFAULT 'rest',
  last_used_at DATETIME    NULL,
  last_used_ip VARCHAR(45) NULL,
  expires_at   DATETIME    NULL,
  revoked_at   DATETIME    NULL,
  created_at   DATETIME(6) NOT NULL,
  UNIQUE KEY api_keys_hash (key_hash),
  KEY api_keys_user (user_id),
  CONSTRAINT api_keys_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE agent_activity (
  id           VARCHAR(36)  NOT NULL PRIMARY KEY,
  user_id      VARCHAR(36)  NOT NULL,
  api_key_id   VARCHAR(36)  NULL,
  key_name     VARCHAR(60)  NOT NULL,
  channel      ENUM('rest','mcp') NOT NULL,
  action       VARCHAR(40)  NOT NULL,
  target_type  ENUM('plan','shopping','recipe') NOT NULL,
  target_id    VARCHAR(190) NOT NULL,
  target_label VARCHAR(200) NOT NULL,
  target_href  VARCHAR(300) NOT NULL,
  summary      VARCHAR(300) NOT NULL,
  undo_payload JSON         NULL,
  created_at   DATETIME(6)  NOT NULL,
  undone_at    DATETIME     NULL,
  seen_at      DATETIME     NULL,
  KEY activity_user (user_id, created_at),
  KEY activity_target (user_id, target_type, target_id),
  CONSTRAINT activity_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Phase 6 (AI): tables only in this draft.
CREATE TABLE ai_usage (
  id            BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       VARCHAR(36) NOT NULL,
  api_key_id    VARCHAR(36) NULL,
  feature       VARCHAR(40) NOT NULL,
  provider      VARCHAR(20) NOT NULL,
  model         VARCHAR(60) NOT NULL,
  input_tokens  INT         NOT NULL DEFAULT 0,
  output_tokens INT         NOT NULL DEFAULT 0,
  duration_ms   INT         NOT NULL DEFAULT 0,
  success       TINYINT(1)  NOT NULL,
  created_at    DATETIME    NOT NULL,
  KEY ai_usage_user (user_id, created_at),
  CONSTRAINT ai_usage_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ai_jobs (
  id          VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id     VARCHAR(36) NOT NULL,
  type        VARCHAR(30) NOT NULL,
  status      ENUM('queued','running','done','failed') NOT NULL DEFAULT 'queued',
  progress    TINYINT     NOT NULL DEFAULT 0,
  input       JSON        NOT NULL,
  result      JSON        NULL,
  error       VARCHAR(500) NULL,
  created_at  DATETIME    NOT NULL,
  finished_at DATETIME    NULL,
  KEY ai_jobs_status (status, created_at),
  KEY ai_jobs_user (user_id),
  CONSTRAINT ai_jobs_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
