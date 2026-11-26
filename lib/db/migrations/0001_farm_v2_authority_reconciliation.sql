BEGIN;
CREATE TABLE farm_v2_authorization_attempt (
 id uuid PRIMARY KEY, user_id text NOT NULL, request_id text NOT NULL, action text NOT NULL,
 state text NOT NULL CHECK(state IN ('OPEN','SETTLED','FENCED')), created_at timestamptz NOT NULL DEFAULT now(), settled_at timestamptz,
 core_settled_at timestamptz
);
CREATE INDEX farm_v2_authorization_outstanding ON farm_v2_authorization_attempt(user_id) WHERE core_settled_at IS NULL;
CREATE TABLE farm_v2_reconciliation_case (
 id text PRIMARY KEY, user_id text NOT NULL, request_id text NOT NULL, actor text NOT NULL,
 evidence text NOT NULL, status text NOT NULL CHECK(status IN ('OPEN','NEEDS_FUNDS','ESCALATED','CLOSED')),
 resolution text, updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_id)
);
CREATE TABLE farm_v2_reconciliation_event (
 id bigserial PRIMARY KEY, case_id text NOT NULL REFERENCES farm_v2_reconciliation_case(id), actor text NOT NULL,
 action text NOT NULL, evidence text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION farm_v2_audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'FARM_AUDIT_IMMUTABLE'; END; $$;
CREATE TRIGGER farm_v2_audit_append_only BEFORE UPDATE OR DELETE ON farm_v2_reconciliation_event FOR EACH ROW EXECUTE FUNCTION farm_v2_audit_append_only();
COMMIT;
