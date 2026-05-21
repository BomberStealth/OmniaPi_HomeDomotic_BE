#!/bin/bash
# OmniaPi FE auto-deploy script
set -euo pipefail

BRANCH="${1:-${DEPLOY_BRANCH:-main}}"
REPO_DIR="${OMNIAPI_FE_DIR:-$HOME/omniapi/FE}"

echo "[deploy-fe] branch=$BRANCH dir=$REPO_DIR"
cd "$REPO_DIR"

# Working tree pulito? (no modifiche locali non committate)
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[deploy-fe] ERRORE: modifiche locali non committate in $REPO_DIR — abort"
  echo "[deploy-fe] Risolvi manualmente con: git status"
  exit 1
fi

echo "[deploy-fe] git fetch + checkout + reset"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "[deploy-fe] npm ci"
npm ci --no-audit --no-fund

echo "[deploy-fe] npm run build"
npm run build

echo "[deploy-fe] OK — versione attiva:"
grep "APP_VERSION" src/config/version.ts | head -1 || true
echo "[deploy-fe] done"
