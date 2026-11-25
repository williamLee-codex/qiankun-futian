-- V6.4 isolate ad reward event and quota writes from service_role.
-- SECURITY DEFINER settlement functions continue to own atomic writes.
BEGIN;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
 ON TABLE platform.ad_reward_events, platform.ad_daily_quotas
 FROM service_role;
-- Read-only diagnostics remain available to the trusted service role.
GRANT SELECT ON TABLE platform.ad_reward_events, platform.ad_daily_quotas
 TO service_role;
COMMIT;
