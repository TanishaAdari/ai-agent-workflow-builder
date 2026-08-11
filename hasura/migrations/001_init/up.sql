CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE organizations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  calls_used integer NOT NULL DEFAULT 0,
  calls_allowed integer NOT NULL DEFAULT 100,
  calls_period_start date NOT NULL DEFAULT date_trunc('month',now())::date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE org_members(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK(role IN ('owner','editor','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,user_id)
);

CREATE TABLE workflows(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workflow_steps(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  position integer NOT NULL,
  type text NOT NULL CHECK(type IN ('llm_call','http_request','db_write','notify','conditional_branch','approval_gate')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workflow_id,position)
);

CREATE TABLE workflow_triggers(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  type text NOT NULL CHECK(type IN ('manual','webhook','scheduled','database_event')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_fired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workflow_runs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  status text NOT NULL CHECK(status IN ('queued','running','paused','completed','failed')),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE step_runs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  workflow_step_id uuid NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
  status text NOT NULL CHECK(status IN ('queued','running','paused','approved','skipped','completed','failed')),
  input jsonb,
  output jsonb,
  error text,
  attempt_count integer NOT NULL DEFAULT 0,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workflow_outputs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_run_id uuid NOT NULL REFERENCES step_runs(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE watched_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  step_run_id uuid REFERENCES step_runs(id) ON DELETE SET NULL,
  channel text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE VIEW org_usage_month AS
SELECT id,name,calls_used,calls_allowed,calls_period_start,
  round((calls_used::numeric/nullif(calls_allowed,0))*100,1) AS usage_percent
FROM organizations;

CREATE INDEX org_members_user_idx ON org_members(user_id);
CREATE INDEX workflows_org_idx ON workflows(org_id);
CREATE INDEX workflow_triggers_schedule_idx ON workflow_triggers(type,last_fired_at);
CREATE INDEX workflow_steps_workflow_idx ON workflow_steps(workflow_id,position);
CREATE INDEX workflow_runs_workflow_idx ON workflow_runs(workflow_id,created_at DESC);
CREATE INDEX step_runs_run_idx ON step_runs(workflow_run_id,created_at);
CREATE INDEX watched_events_org_idx ON watched_events(org_id,created_at DESC);
CREATE INDEX notifications_org_idx ON notifications(org_id,created_at DESC);
