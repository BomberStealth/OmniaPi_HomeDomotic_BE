#!/bin/bash

# ============================================
# OMNIAPI HOME DOMOTIC - SETUP RASPBERRY PI
# ============================================

set -e

echo "🏠 OmniaPi Home Domotic - Setup Raspberry Pi"
echo "=============================================="
echo ""

# Colori per output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Repository GitHub
REPO_BE="https://github.com/BomberStealth/OmniaPi_HomeDomotic_BE.git"
REPO_FE="https://github.com/BomberStealth/OmniaPi_HomeDomotic_FE.git"

# Directory di installazione
INSTALL_DIR="/home/pi/omniapi-home"
BE_DIR="$INSTALL_DIR/backend"
FE_DIR="$INSTALL_DIR/frontend"

echo -e "${BLUE}📦 Aggiornamento sistema...${NC}"
sudo apt update && sudo apt upgrade -y

echo -e "${BLUE}📦 Installazione dipendenze...${NC}"
# Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PM2 per gestione processi
sudo npm install -g pm2

# Nginx come reverse proxy
sudo apt install -y nginx

# Mosquitto MQTT broker
sudo apt install -y mosquitto mosquitto-clients

echo -e "${BLUE}📂 Creazione directory...${NC}"
mkdir -p $INSTALL_DIR
cd $INSTALL_DIR

echo -e "${BLUE}📥 Clone repository...${NC}"
# Backend
if [ ! -d "$BE_DIR" ]; then
    git clone $REPO_BE $BE_DIR
else
    echo "Backend già esistente, aggiorno..."
    cd $BE_DIR && git pull && cd ..
fi

# Frontend
if [ ! -d "$FE_DIR" ]; then
    git clone $REPO_FE $FE_DIR
else
    echo "Frontend già esistente, aggiorno..."
    cd $FE_DIR && git pull && cd ..
fi

echo -e "${BLUE}📦 Installazione dipendenze Backend...${NC}"
cd $BE_DIR
npm install
npm run build

echo -e "${BLUE}🗄️ Configurazione database...${NC}"
echo "Eseguo migrazioni database..."
npm run migrate

echo -e "${BLUE}📦 Installazione dipendenze Frontend...${NC}"
cd $FE_DIR
npm install
npm run build

echo -e "${BLUE}⚙️ Configurazione Nginx...${NC}"
sudo tee /etc/nginx/sites-available/omniapi > /dev/null <<EOF
# OmniaPi Home Domotic - Nginx Configuration

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name ofwd.asuscomm.com 192.168.1.11;
    return 301 https://\$server_name\$request_uri;
}

# HTTPS Server
server {
    listen 443 ssl http2;
    server_name ofwd.asuscomm.com 192.168.1.11;

    # SSL Configuration (da configurare con Let's Encrypt)
    # ssl_certificate /etc/letsencrypt/live/ofwd.asuscomm.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/ofwd.asuscomm.com/privkey.pem;

    # Per ora usa certificato self-signed
    ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem;
    ssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;

    # Frontend (React build)
    location / {
        root $FE_DIR/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # WebSocket
    location /socket.io {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}

# Port 8080 (alternativo)
server {
    listen 8080;
    server_name ofwd.asuscomm.com 192.168.1.11;

    location / {
        root $FE_DIR/dist;
        try_files \$uri \$uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Abilita il sito
sudo ln -sf /etc/nginx/sites-available/omniapi /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx

echo -e "${BLUE}⚙️ Configurazione PM2...${NC}"
cd $INSTALL_DIR

# Crea ecosystem.config.js per PM2
tee ecosystem.config.js > /dev/null <<EOF
module.exports = {
  apps: [
    {
      name: 'omniapi-backend',
      cwd: '$BE_DIR',
      script: 'dist/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
EOF

echo -e "${BLUE}🚀 Avvio applicazione con PM2...${NC}"
pm2 start ecosystem.config.js
pm2 save
pm2 startup

echo -e "${BLUE}⚙️ Configurazione Mosquitto MQTT...${NC}"
sudo tee -a /etc/mosquitto/mosquitto.conf > /dev/null <<EOF

# OmniaPi Configuration
listener 1883
allow_anonymous true
EOF

sudo systemctl restart mosquitto
sudo systemctl enable mosquitto

echo -e "${GREEN}✅ Setup completato!${NC}"
echo ""
echo "=============================================="
echo "🏠 OmniaPi Home Domotic installato!"
echo "=============================================="
echo ""
echo "📍 Accesso locale:    http://192.168.1.11"
echo "🌐 Accesso remoto:    https://ofwd.asuscomm.com"
echo "🔌 Backend API:       http://192.168.1.11:3000/api"
echo "📡 MQTT Broker:       mqtt://192.168.1.11:1883"
echo ""
echo "🔑 Credenziali default:"
echo "   Email:    admin@omniapi.com"
echo "   Password: admin123"
echo ""
echo "⚙️  Comandi utili:"
echo "   pm2 status              - Stato applicazioni"
echo "   pm2 logs                - Log in tempo reale"
echo "   pm2 restart all         - Riavvia tutto"
echo "   sudo systemctl status nginx - Stato Nginx"
echo ""
echo "📝 Prossimi passi:"
echo "   1. Configura certificato SSL con Let's Encrypt"
echo "   2. Cambia password admin"
echo "   3. Configura dispositivi Tasmota"
echo ""
