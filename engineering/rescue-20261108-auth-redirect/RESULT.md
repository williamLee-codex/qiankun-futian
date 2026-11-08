# Isolated OAuth redirect repair — 2026-11-08 (Asia/Taipei)

## Observed failure
A real Google login was performed from the protected Farm platform preview after the user completed device verification. The Google authorization request used Supabase project `ijguwqserwiufpxizgzy` and requested the current preview callback. After authentication the browser landed on the production domain rather than the isolated callback. A fresh isolated-origin tab still showed Google login, confirming that an isolated platform Session was not established.

## Dashboard evidence
The authenticated Supabase dashboard identified the project as `imperial-agent-test` (`ijguwqserwiufpxizgzy`).
Its Site URL was `https://yuceluopan.com`. Its three Redirect URL entries were:
- `https://qiankun-futian-main-g49skz87q-williamlee-codexs-projects.vercel.app/**`
- `https://qiankun-futian-main-pllqtp0oi-williamlee-codexs-projects.vercel.app/auth/callback`
- `https://imperial-ads-isolated-test-96ueciwhu-williamlee-codexs-projects.vercel.app/auth/callback`

The actual current preview callback was missing. Platform source at `b884034c3c1eb6d627fec7d9474cca65f5e1d1fb` generates a callback at the request origin and encodes the safe `next` query. Supabase documentation and dashboard help identify the Site URL as the fallback for a redirect not matching the allowlist.

## Authorized change
After explicit user approval immediately before saving, added exactly:
`https://qiankun-futian-main-git-test-ff65ec-williamlee-codexs-projects.vercel.app/auth/callback?next=%2F`

The dashboard displayed `Successfully added 1 URL`, then showed the new entry and `Total URLs: 4`.
The Site URL and the other three entries were retained. No production Supabase project, credentials, database rows, or deployment was changed by this repair.

## Verification limitation
Clicking Google login again after saving was blocked by the cloud browser URL policy. The tool reported that the requested target protocol was not allowed (only HTTP and HTTPS are allowed). No workaround or alternate browser route was attempted after the rejection.

The redirect allowlist edit is confirmed saved, but successful post-change OAuth callback, platform Session, launchToken exchange, and Farm login are NOT yet verified. This is not an end-to-end PASS. Release remains NO-GO.

## Recovery
The change can be reversed by removing only the newly added entry from the isolated project's Redirect URLs after the user authorizes that action. This would restore the previous three-entry configuration. No key rotation or Site URL change is needed.

Authentication codes, browser session tokens, provider tokens, cookies and temporary Vercel access-link values are intentionally absent from this evidence.
