#!/bin/bash

# ============================================
# OMNIAPI HOME DOMOTIC - UPDATE APPLICATION
# ============================================

set -e

INSTALL_DIR="/home/pi/omniapi-home"
BE_DIR="$INSTALL_DIR/backend"
FE_DIR="$INSTALL_DIR/frontend"

echo "🔄 Aggiornamento OmniaPi Home Domotic..."
echo ""

echo "📥 Pulling latest changes..."

# Backend
echo "Backend..."
cd $BE_DIR
git pull
npm install
npm run build

# Frontend
echo "Frontend..."
cd $FE_DIR
git pull
npm install
npm run build

echo "🔄 Riavvio applicazione..."
cd $INSTALL_DIR
pm2 restart all

sleep 2
pm2 status

echo ""
echo "✅ Aggiornamento completato!"
