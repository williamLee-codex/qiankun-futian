# Approved cave artwork integration

User approved landscape and latest portrait artwork on 2026-11-02. Preserve six decor slots and existing server-backed operations. Reserve rear gate and treasure alcove visually; no dungeon link or new treasure feature.

Implementation: fixed viewport cave surface, contain artwork without cropping; image and six transparent hit regions share the exact aspect-ratio box. Existing exterior scrolling remains. Close button and Escape restore entry focus. Existing decor panel remains authoritative; do not fabricate owned item images or balances.

Plan: integrate WebP encodings of approved originals; place desktop/mobile anchors; verify JSX syntax and Vercel build; inspect deployed release and assets on existing Preview alias. No database changes, production promotion, shared branch push or Actions.

Verification: local TypeScript transpilation diagnostics zero. Browser binary is unavailable; real visual/interaction acceptance remains pending. Existing full-suite unrelated failures from previous work were not re-run for this visual change.
