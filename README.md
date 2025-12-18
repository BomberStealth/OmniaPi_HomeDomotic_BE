# 🏠 OmniaPi Home Domotic

Sistema di domotica completo simile a BTicino Control, con gestione luci, tapparelle e termostati tramite dispositivi Tasmota.

## 📋 Caratteristiche

- **Backend**: Node.js + Express + TypeScript + WebSocket + MQTT
- **Frontend**: React + TypeScript + Tailwind CSS (effetto vetro)
- **Database**: MySQL (Aiven Cloud)
- **Dispositivi**: Tasmota (WiFi relè)
- **Autenticazione**: JWT
- **Real-time**: Socket.io
- **Multilingua**: Italiano/Inglese

### Ruoli Utente
- **Cliente**: Visualizza e controlla dispositivi del proprio impianto
- **Installatore**: Crea impianti, aggiunge/rimuove dispositivi, configura stanze
- **Admin**: Gestione completa utenti e sistema

### Funzionalità
- Dashboard con statistiche e shortcuts
- Gestione impianti (piani, stanze, dispositivi)
- Controllo dispositivi:
  - 💡 Luci (on/off, dimmer)
  - 🪟 Tapparelle (apri/chiudi/posizione)
  - 🌡️ Termostati (temperatura, modalità)
- Scene/Automazioni personalizzate
- Notifiche real-time
- Responsive (desktop/mobile)

## 🚀 Installazione Rapida su Raspberry Pi

### Prerequisiti
- Raspberry Pi (testato su Raspberry Pi 4)
- Raspberry Pi OS Lite/Desktop
- Connessione internet
- Accesso SSH al Raspberry

### 1️⃣ Setup Iniziale

```bash
# Scarica gli script di setup
wget https://raw.githubusercontent.com/BomberStealth/OmniaPi_HomeDomotic_BE/main/setup-raspberry.sh
chmod +x setup-raspberry.sh

# Esegui il setup (può richiedere 10-15 minuti)
./setup-raspberry.sh
```

Lo script di setup:
- Installa Node.js 20.x
- Installa PM2 per gestione processi
- Installa Nginx come reverse proxy
- Installa Mosquitto MQTT broker
- Clona i repository
- Installa dipendenze
- Configura database
- Compila applicazioni
- Avvia tutto automaticamente

### 2️⃣ Configurazione SSL (Opzionale ma consigliato)

```bash
chmod +x install-ssl.sh
./install-ssl.sh
```

## 📱 Utilizzo

### Avvio/Arresto Applicazione

```bash
# Avvia
./start.sh

# Arresta
./stop.sh

# Aggiorna da GitHub
./update.sh
```

### Accesso all'applicazione

- **Locale**: `http://192.168.1.11`
- **Remoto**: `https://ofwd.asuscomm.com`
- **API**: `http://192.168.1.11:3000/api`

**Credenziali default:**
- Email: `admin@omniapi.com`
- Password: `admin123`

⚠️ **IMPORTANTE**: Cambia la password al primo accesso!

## 🛠️ Comandi Utili

### PM2 (Gestione Backend)
```bash
pm2 status              # Stato applicazione
pm2 logs                # Log in tempo reale
pm2 logs omniapi-backend --lines 100  # Ultimi 100 log
pm2 restart all         # Riavvia
pm2 stop all            # Ferma
pm2 monit              # Monitor risorse
```

### Nginx (Web Server)
```bash
sudo systemctl status nginx    # Stato
sudo systemctl restart nginx   # Riavvia
sudo nginx -t                  # Test configurazione
sudo tail -f /var/log/nginx/error.log  # Log errori
```

### Mosquitto (MQTT)
```bash
sudo systemctl status mosquitto   # Stato
mosquitto_sub -t '#' -v          # Monitora tutti i messaggi
mosquitto_pub -t 'test' -m 'hello'  # Pubblica messaggio test
```

### Database
```bash
# Se serve ricreare le tabelle
cd /home/pi/omniapi-home/backend
npm run migrate
```

## 🔧 Configurazione Dispositivi Tasmota

### 1. Configura dispositivo Tasmota

```bash
# Collega il dispositivo Tasmota al WiFi
# Poi configura MQTT:
# Configuration -> Configure MQTT

Host: 192.168.1.11
Port: 1883
Topic: tasmota_%06X  (default)
```

### 2. Aggiungi dispositivo nell'app

1. Accedi come Installatore/Admin
2. Vai su Impianti > Seleziona impianto
3. Crea/Seleziona stanza
4. Clicca "Aggiungi Dispositivo"
5. Inserisci:
   - Nome: es. "Luce Soggiorno"
   - Tipo: Luce/Tapparella/Termostato
   - Topic MQTT: es. "tasmota_ABC123"

## 📁 Struttura Progetto

```
OmniaPi_HomeDomotic/
├── OmniaPi_HomeDomotic_BE/        # Backend
│   ├── src/
│   │   ├── config/                # Configurazioni (DB, JWT, MQTT)
│   │   ├── controllers/           # Controller API
│   │   ├── middleware/            # Auth, error handling
│   │   ├── routes/                # Definizione route
│   │   ├── socket/                # WebSocket handlers
│   │   ├── types/                 # TypeScript types
│   │   └── utils/                 # Utility e migrations
│   ├── .env                       # Variabili ambiente
│   └── package.json
│
├── OmniaPi_HomeDomotic_FE/        # Frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/           # Button, Card, Input, Modal
│   │   │   ├── layout/           # Layout, Sidebar
│   │   │   ├── dispositivi/      # Componenti dispositivi
│   │   │   └── impianti/         # Componenti impianti
│   │   ├── pages/                # Pagine applicazione
│   │   ├── services/             # API client, Socket
│   │   ├── store/                # State management (Zustand)
│   │   ├── types/                # TypeScript types
│   │   └── i18n/                 # Traduzioni IT/EN
│   └── package.json
│
└── Scripts/                       # Script gestione
    ├── setup-raspberry.sh         # Setup iniziale
    ├── start.sh                   # Avvio app
    ├── stop.sh                    # Stop app
    ├── update.sh                  # Aggiornamento
    └── install-ssl.sh             # Installa SSL
```

## 🗄️ Schema Database

### Tabelle principali:
- `utenti` - Gestione utenti e autenticazione
- `impianti` - Impianti domotici
- `piani` - Piani degli impianti
- `stanze` - Stanze per piano
- `dispositivi` - Dispositivi (luci, tapparelle, termostati)
- `scene` - Scene/automazioni
- `notifiche` - Sistema notifiche

## 🔐 Sicurezza

### Best Practices implementate:
- ✅ Password hashate con bcrypt
- ✅ Autenticazione JWT
- ✅ Rate limiting sulle API
- ✅ Helmet.js per headers sicuri
- ✅ CORS configurato
- ✅ HTTPS con Let's Encrypt
- ✅ Validazione input con Joi
- ✅ .env per secrets

### Raccomandazioni:
1. Cambia subito la password admin
2. Usa password forti per tutti gli utenti
3. Cambia `JWT_SECRET` in `.env`
4. Configura firewall:
```bash
sudo ufw allow 22       # SSH
sudo ufw allow 80       # HTTP
sudo ufw allow 443      # HTTPS
sudo ufw allow 8080     # HTTP alternativo
sudo ufw enable
```

## 🐛 Troubleshooting

### Backend non si avvia
```bash
# Controlla log
pm2 logs omniapi-backend

# Verifica database
cd /home/pi/omniapi-home/backend
npm run migrate

# Rebuild
npm run build
pm2 restart all
```

### Frontend non carica
```bash
# Rebuild frontend
cd /home/pi/omniapi-home/frontend
npm run build

# Riavvia Nginx
sudo systemctl restart nginx
```

### Dispositivi non rispondono
```bash
# Controlla MQTT broker
sudo systemctl status mosquitto

# Monitora messaggi MQTT
mosquitto_sub -t 'stat/#' -v
mosquitto_sub -t 'cmnd/#' -v

# Verifica topic dispositivo in app
```

### WebSocket non connette
```bash
# Verifica Nginx configurazione WebSocket
sudo nginx -t

# Controlla log Nginx
sudo tail -f /var/log/nginx/error.log
```

## 📞 Supporto

Per problemi o domande:
1. Controlla i log: `pm2 logs`
2. Verifica configurazione Nginx: `sudo nginx -t`
3. Controlla stato servizi: `pm2 status`, `sudo systemctl status nginx`

## 📄 Licenza

MIT License - Vedi LICENSE file

## 🙏 Credits

- Frontend design ispirato a BTicino Control
- Componenti UI da [hover.dev](https://hover.dev)
- Icone da Lucide React
