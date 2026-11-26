# Farm local coins and manual transfers

Approved behavior: players manually transfer central coins into Farm or return Farm coins to central. No automatic sweeps or balance duplication. Farm coin purchases and rewards settle with Farm assets in one PostgreSQL transaction. Crystals retain the existing central wallet. Legacy pending wallet journals retain their original settlement and keys. A 30-minute verified session cache is separately authorized; cache expiry must never exceed credential expiry.

Implementation: additive Farm coin balance and immutable ledger; narrowly granted atomic central/Farm transfer and read routines; transaction-scoped local coin settlement for new seed, crop and workshop requests; existing recovery remains central. Feature remains disabled until schema, code, transfer conservation/concurrency/retry tests, UI verification and latency measurements pass. Never enable half of the two-repository release.

- [ ] Write failing tests for transfer validation, local settlement, duplicate payload conflicts and UI retry behavior.
- [ ] Implement schema/functions with row locks, ledger keys, central wallet status checks, integer bounds, restricted execution and RLS.
- [ ] Wire transaction-scoped local settlement and manual wallet overlay into existing API/idempotency flow.
- [ ] Test isolated SQL rollback, insufficient funds, repeated/concurrent transfers, failed asset commit, legacy recovery, app typecheck/build/full suite.
- [ ] Add expiry-bounded 30-minute session cache and expiry/revocation tests.
- [ ] Deploy preview, verify player flows and measure elapsed latency before production switch.
