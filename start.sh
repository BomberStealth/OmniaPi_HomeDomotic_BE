#!/bin/bash

# ============================================
# OMNIAPI HOME DOMOTIC - START APPLICATION
# ============================================

INSTALL_DIR="/home/pi/omniapi-home"

echo "🏠 Avvio OmniaPi Home Domotic..."
echo ""

# Avvia backend con PM2
cd $INSTALL_DIR
pm2 start ecosystem.config.js

# Verifica stato
sleep 2
pm2 status

echo ""
echo "✅ Applicazione avviata!"
echo ""
echo "📍 Accesso: https://ofwd.asuscomm.com"
echo "⚙️  Log: pm2 logs"
