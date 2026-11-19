# Farm V2 API protected platform callback

Source: 8083c2e8cd4d9a5bcae1dd47181f94f685a91af4, preserving the reviewed eight
features and follow-up UI fixes. Paired platform candidate:
622532b6844891c42bf83b206c94566870f22e87.

Code defects reproduced before this change:
- Protected platform calls in production did not attach runtime OIDC at all.
- A supplied protection-bypass header was retained rather than removed/replaced
  with a server-bound target credential.

The V2 fetch boundary now strips caller OIDC/bypass/cookie-bypass headers,
validates the exact configured HTTPS platform origin and API path in both Vercel
production and preview, attaches its own runtime identity, and optionally attaches
the server-only FARM_V2_PLATFORM_AUTOMATION_SECRET for that target's official
Automation Bypass authentication. Redirects still fail and existing application
shared-secret/Session credentials are unchanged. SSO remains enabled; no public
bypass, cookie, credential query string or new client-side secret exists.

This is code readiness, not proof that an edge accepts a runtime token. The
actual receiving project's trust/automation credential, current backend origin,
Preview database isolation and paired app authority must be verified before any
entry flag is enabled. FARM_V2_ENTRY_ENABLED and PLATFORM_BASE_URL were not
changed here. Do not reuse an old integration-test site, initialize assets, create
a database, change roles or weaken TLS to obtain a green response.

Executed checks:
- Protected platform transport 8/8 PASS (preview/production, spoofed credential
  removal, application auth preservation, origin/path restrictions, redirects).
- Full Vitest 314 PASS; 58 skipped, not inferred PASS.
- Node 52 PASS.
- Workspace typecheck PASS.
- Frontend build using existing main-proxy API path /api/farm-backend/ PASS.
- API build PASS.
- git diff --check PASS.

The paired platform passed its four actual proxy contract tests, typecheck and
V1/V2 route-boundary check. No V1, login, other App or database code changed.
No production Session, sow/harvest, eight-feature live acceptance or deployment
was performed: current callable tools/credential bindings do not provide Vercel
or Supabase access. No production rollback deployment is claimed verified.

Permanent /futian PR #262 stays separate until the live transport/entry and
regression gates pass. For the complete ordered configuration/acceptance process,
see docs/farm-v2-auth/cross-project-20261119.md in the paired platform candidate.
