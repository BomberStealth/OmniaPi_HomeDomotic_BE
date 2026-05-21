#!/bin/bash
# OmniaPi BE auto-deploy script
set -euo pipefail

BRANCH="${1:-${DEPLOY_BRANCH:-main}}"
REPO_DIR="${OMNIAPI_BE_DIR:-$HOME/omniapi/BE}"
PM2_APP="${OMNIAPI_BE_PM2:-omniapi-be}"

echo "[deploy-be] branch=$BRANCH dir=$REPO_DIR"
cd "$REPO_DIR"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[deploy-be] ERRORE: modifiche locali non committate in $REPO_DIR — abort"
  echo "[deploy-be] Risolvi manualmente con: git status"
  exit 1
fi

echo "[deploy-be] git fetch + checkout + reset"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "[deploy-be] npm ci"
npm ci --no-audit --no-fund

echo "[deploy-be] npm run build"
npm run build

echo "[deploy-be] pm2 restart $PM2_APP"
pm2 restart "$PM2_APP" --update-env

echo "[deploy-be] done"
