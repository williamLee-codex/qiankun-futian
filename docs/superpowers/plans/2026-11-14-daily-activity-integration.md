# Daily activity integration plan

Base Farm commit: e8124fe931065f29932e8347a895e7569fa06e16. Main frontend pin will advance only after Farm verification.

Goal: replace legacy daily task display with authoritative six-task activity and 30/60/100 manual rewards, preserving weekly missions and existing player/inventory data. Use only original Farm repo and production DB qowjznvinqoxekiyjyvy. Never access Agent database.

Specification: latest user decisions retrieved 2026-11-14. 17 task pool: plant once; plant 5 or 10 plants; harvest 5 or 10 plants; buy seeds once; buy 5 or 10 seeds; synthesize once; display/change pot once; open warehouse once; feed owned pet once; view owned pet once; interact with friend once; visit friend once; plant two species; harvest two species. Six distinct tasks/player/day, Taiwan 05:00 day, 20 points each, max120. Plant5/10, harvest5/10, buy5/10 mutually exclusive pairs. At most one pure click task (warehouse/pet inspection). Only completable/unlocked tasks; first-field player must get six. Manual rewards 30=10 coins,60=random yellow pot,100=one spirit sand. No past event backfill.

- [ ] SQL: deterministic eligible assignment, append-only unique server events, summaries and atomic idempotent manual claims, restricted RPC boundary, existing durable-mutation event trigger; rollback verification.
- [ ] API/UI: authenticated activity endpoints and inspection events, six-task panel with milestone buttons, preserve weekly tasks and deny new legacy daily claims without damaging recovery.
- [ ] Integration: full Farm tests/build, SQL rollback tests, deploy API, advance exact main frontend source pin, deploy/promote, browser verify live task list and one safe inspection event; preserve data.

Progress: production currently has no daily-activity schema/RPC. Existing dailyActivityRules.ts only eight task candidates, no gameplay event persistence. Signed-in user and all six fields verified. User's day-one sign-in credited exactly10 central coins, one ledger row. Existing mission state must remain intact.
