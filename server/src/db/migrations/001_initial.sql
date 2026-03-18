-- WebCall 2.0 Initial Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  display_name    VARCHAR(100) NOT NULL,
  role            VARCHAR(20) NOT NULL DEFAULT 'agent' CHECK (role IN ('admin', 'agent')),
  priority        INTEGER NOT NULL DEFAULT 100,
  is_available    BOOLEAN NOT NULL DEFAULT false,
  is_online       BOOLEAN NOT NULL DEFAULT false,
  is_busy         BOOLEAN NOT NULL DEFAULT false,
  last_heartbeat  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_routing ON agents (is_available, is_online, is_busy, priority);
CREATE INDEX IF NOT EXISTS idx_agents_email ON agents (email);

CREATE TABLE IF NOT EXISTS call_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id       VARCHAR(255) NOT NULL,
  agent_id        UUID REFERENCES agents(id),
  status          VARCHAR(20) NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','ringing','active','completed','missed','rejected','abandoned')),
  queued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at     TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  duration_sec    INTEGER,
  end_reason      VARCHAR(50),
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_logs_agent ON call_logs (agent_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_status ON call_logs (status);

CREATE TABLE IF NOT EXISTS sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  refresh_token   VARCHAR(512) NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions (agent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions (refresh_token);
