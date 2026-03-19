-- Change call_logs.agent_id FK to SET NULL on delete
ALTER TABLE call_logs DROP CONSTRAINT IF EXISTS call_logs_agent_id_fkey;
ALTER TABLE call_logs ADD CONSTRAINT call_logs_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;
