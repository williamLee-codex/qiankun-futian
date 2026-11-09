# Taipei 05:00 mission display fix

Live acceptance found previous-period completion displayed after reset, while server correctly refused claim. Normalize snapshot with existing rollMissionPeriods at render; do not mutate source or grant rewards.

Reproduction fixture: SOW at 2026-11-08T20:59:00Z, render at21:03:00Z. Red: UI incorrectly1/1 and enabled. Green:0/1 and disabled; original snapshot preserved.

Validation Node24.22.1: focused3files10pass; pnpm test218pass52skip plus34Nodepass; pnpm typecheck exit0. Database/browser suites skipped in this plain run; prior real PostgreSQL evidence remains separate. Actual synthesis and Agent live cycle not passed. No production changes.

Live API alignment: ea753a28bfda876a739e0e81d6cced85250ad772 deployment dpl_D5ZiF2TDtvUvYjkAfi1kC8C2aSS2 READY; test alias moved from dpl_3enBhEPsaZFQMaM4Z4RUUfrZ9wLQ only. GETstate200 confirmed. ClaimMISSION_D01 at21:03Z409; journalPENDING with no assetPlan/walletAmount, materials remain0. Retain audit; no journal deletion or fabricated success.
