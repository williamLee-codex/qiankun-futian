# Fixed Preview callback acceptance probe

Source verified: ff53bacb6f3dd978d27b18c2196f2f0a571fda57 on
fix/farm-v2-eight-plus-auth-20261119; paired main candidate remains
622532b6844891c42bf83b206c94566870f22e87. No previous feature work is replaced.

The ff53bac probe used its own fetch and omitted the platform-target automation
credential that the real V2 callback already supports. It could therefore remain
behind SSO even when that server credential was correctly bound. The minimal
repair sends the same server-only FARM_V2_PLATFORM_AUTOMATION_SECRET, when set,
to the already pinned main-site Preview. Incoming browser headers are never used.
OIDC, application authentication, redirect rejection, fixed target and all probe
activation gates remain unchanged. No bypass cookie or public credential is used.

Regression reproduced before repair, then targeted tests passed: 13 total
(5 probe cases and 8 existing protected-transport cases). They cover fixed target,
server-only credentials, 403 rejection, exact 401 contract, disabled production/
open-entry mode, rejected write methods and callback origin/path protections.
These mocked transport tests are NOT an actual HTTP acceptance.

The probe deliberately expects 401 FARM_SESSION_NOT_ACTIVE for a random invalid
credential. A pass proves only that this protected callback reaches the app's
credential rejection contract. It does NOT prove valid Google login, Session
creation, farm reads, sow/harvest, inventory correctness or production readiness.
Do not promote based solely on that response. No production data was touched.

## Actual external state

Both www.yuceluopan.com and Vercel API probes from this executor were blocked at
the Cloud CONNECT proxy (server envoy), before reaching Vercel. This is distinct
from the user-reported upstream Session 403. No usable Vercel tool/token binding
is exposed to this executor, and deployed Preview URLs/aliases cannot be fetched
or asserted READY from Git source alone. Only the pinned callback URL is known
from this reviewed source; do not invent a backend deployment URL.

A Cloud configuration draft was saved to request only these added destinations:
www.yuceluopan.com, yuceluopan.com, api.vercel.com and *.vercel.app, preserving the
package-manager preset. VERCEL_TOKEN is requested through secure settings with
api.vercel.com as its only credential destination. No token value was supplied,
printed or committed. Draft saving is not runtime application/publication.
The user must save/publish the configured draft before those operations can run.
No Vercel project setting, SSO policy, entry flag or origin was changed here.

After actual access is ready: read both immutable Preview deployments, aliases,
DNS/connection result, target protection and exact server environment bindings;
run the protected callback check from the runtime, then the valid non-destructive
Session/read acceptance through the paired main proxy. If any gate fails, stop
without extra deployments or disabling protection. Only a genuinely accepted
artifact may be promoted with a verified production rollback target. Never count
unit/build results as live HTTP results or ask players to repeat risky actions.
