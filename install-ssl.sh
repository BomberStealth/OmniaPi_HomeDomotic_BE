#!/bin/bash

# ============================================
# INSTALLA CERTIFICATO SSL CON LET'S ENCRYPT
# ============================================

set -e

echo "🔐 Installazione certificato SSL..."
echo ""

# Installa Certbot
sudo apt install -y certbot python3-certbot-nginx

# Ottieni certificato (sostituisci con la tua email)
echo "⚠️  Inserisci la tua email per Let's Encrypt:"
read EMAIL

sudo certbot --nginx -d ofwd.asuscomm.com --email $EMAIL --agree-tos --non-interactive

# Rinnovo automatico
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

echo ""
echo "✅ Certificato SSL installato!"
echo "🔄 Il rinnovo automatico è configurato"
