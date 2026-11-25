-- Ads V6.4 fail-closed until provider-signed SSV is implemented.
-- The caller-supplied provider transaction ID is not proof of ad completion.
REVOKE ALL ON FUNCTION public.ad_mark_session_provider_verified_v64(uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.ad_complete_verified_session_v64(uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION platform.mark_ad_session_provider_verified_v64(uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION platform.complete_verified_ad_session_v64(uuid,text,text)
  FROM PUBLIC,anon,authenticated,service_role;
