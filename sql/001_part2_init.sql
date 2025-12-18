CREATE TABLE IF NOT EXISTS part2_kv (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO part2_kv (key, value)
VALUES ('config', jsonb_build_object(
  'logsChannelId', null,
  'welcomeChannelId', null,
  'autoroleName', '📘 Employé en Formation',
  'staffRoleIds', jsonb_build_array('1440689651718422569','1440689790868521101'),
  'comptaRoleIds', jsonb_build_array('1440689651718422569','1440689790868521101'),
  'automod', jsonb_build_object(
    'enabled', true,
    'spam', jsonb_build_object('maxMessages', 6, 'perSeconds', 4),
    'action', jsonb_build_object('type', 'timeout', 'durationSeconds', 30),
    'blockInvites', true,
    'maxMentions', 5,
    'whitelist', jsonb_build_object('channelIds', jsonb_build_array(), 'roleIds', jsonb_build_array())
  )
))
ON CONFLICT (key) DO NOTHING;

-- Scheduler (messages récurrents)
CREATE TABLE IF NOT EXISTS part2_schedules (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text','embed')),
  every_seconds INT NOT NULL CHECK (every_seconds > 0),
  payload JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_part2_schedules_next_run
ON part2_schedules (active, next_run_at);

-- Templates d’embed (Embed Studio)
CREATE TABLE IF NOT EXISTS part2_embed_templates (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (guild_id, name)
);
