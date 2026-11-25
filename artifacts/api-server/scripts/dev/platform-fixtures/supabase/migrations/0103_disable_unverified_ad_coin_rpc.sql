-- Ads V6.4: fail closed until authenticated ad-provider verification is wired.
-- The v64 RPC currently trusts a service caller's reward amount and event ID.
-- Preserve function and test data, but disallow runtime EXECUTE.
REVOKE EXECUTE ON FUNCTION platform.settle_verified_ad_coin_v64(
  uuid, text, text, text, integer
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION platform.settle_verified_ad_coin_v64(
  uuid, text, text, text, integer
) IS 'DISABLED: requires verified provider callback, server-issued session, character ownership and authoritative reward amount before EXECUTE can be granted.';
