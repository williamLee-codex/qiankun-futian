# Farm sign-in deployment repair

Goal: deploy the existing sign-in implementation within qiankun-futian and qiankun-farm-v2-api, preserving existing Farm state.

- [x] Reproduce the missing production capability and confirm runtime cannot directly credit the central wallet.
- [ ] Install the existing 30-day SQL plus a fixed-operation private capability. Resolve only canonical active auth UUIDs with existing Farm player state. Keep all internal sign-in functions SECURITY INVOKER and deny runtime direct wallet execution.
- [ ] Route authenticated API calls through the capability; never accept client reward amounts or current dates.
- [ ] Run all existing SQL regression cases with changes rolled back, plus the deployment/ACL contract.
- [ ] Build the exact reviewed Farm commit, inspect readiness and unauthenticated access, and release only after database/API compatibility is verified.

Constraints: no Agent database access, no inventory movement, no database rebuild, no historical repair. Production project reference is qowjznvinqoxekiyjyvy per existing Farm deployment documentation. Current production deployment remains the rollback candidate.
