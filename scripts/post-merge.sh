#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Schema changes require a separately reviewed, authorized release.
# Never mutate a bound database automatically after a merge.
