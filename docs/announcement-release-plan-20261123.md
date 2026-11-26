# Announcement release integration

Goal: complete the existing HOME and FARM_V2 announcement system using the production targets array contract.

Constraints: preserve all production rows and columns; never change Farm V1, login, unrelated apps or database objects. One integration commit per repository. No repeated whole-site CI runs.

- [ ] Capture announcement-only metadata, rows and Storage inventory before any production writes.
- [ ] Restore that snapshot into isolated PostgreSQL; prove migration, public visibility, service-role permissions, receipt isolation and rollback without losing records.
- [ ] Integrate the reviewed V2 overlay onto latest main-pinned Farm source (at least 10cc8a90), preserving later changes.
- [ ] Unify admin create/full edit, published reads and receipts on targets; test validation and complete editor payloads before implementation.
- [ ] Verify focused tests, typechecks and builds; review all changed files against scope.
- [ ] Stage a production candidate with no domain assignment; use real browser accounts for upload, edit, targets, seen/expiry and hide persistence.
- [ ] Recheck main and production alias, then promote only the accepted candidate. Stop affected operations on any new anomaly.

Rollback: return alias to its captured deployment; keep additive announcement objects and all rows unless the isolated, reviewed rollback is required. Restore original ACLs and remove only newly introduced projection/policy objects if rolling back the database. Never drop original tables or columns.

Verified locally: 15 focused V2 announcement/current-wallet tests; Farm TypeScript. Main: 34 announcement tests and TypeScript. Isolated PostgreSQL migration and rollback preserved 4 announcements and 1 receipt. Production changes and browser acceptance remain pending.
