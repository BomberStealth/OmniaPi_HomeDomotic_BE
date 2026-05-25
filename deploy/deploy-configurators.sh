#!/bin/bash
# OmniaPi Configurators auto-deploy script
set -euo pipefail

BRANCH="${1:-${DEPLOY_BRANCH:-main}}"
REPO_DIR="${OMNIAPI_CONF_DIR:-$HOME/omniapi/configurators}"
BE_PM2="${OMNIAPI_CONF_BE_PM2:-omniapi-configurators-be}"

echo "[deploy-configurators] branch=$BRANCH dir=$REPO_DIR"
cd "$REPO_DIR"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[deploy-configurators] ERRORE: modifiche locali non committate in $REPO_DIR — abort"
  echo "[deploy-configurators] Risolvi manualmente con: git status"
  exit 1
fi

echo "[deploy-configurators] git fetch + checkout + reset"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

# Build FE
echo "[deploy-configurators] build FE"
cd "$REPO_DIR/FE"
npm ci --no-audit --no-fund
npm run build

# Restart BE (solo se il processo PM2 esiste)
if pm2 describe "$BE_PM2" > /dev/null 2>&1; then
  echo "[deploy-configurators] restart BE pm2:$BE_PM2"
  cd "$REPO_DIR/BE"
  npm ci --no-audit --no-fund
  pm2 restart "$BE_PM2" --update-env
else
  echo "[deploy-configurators] nessun processo PM2 '$BE_PM2' trovato, skip restart BE"
fi

echo "[deploy-configurators] done"
