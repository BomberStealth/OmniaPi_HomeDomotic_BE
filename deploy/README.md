# OmniaPi Auto-Deploy via GitHub Webhook

Sistema di deploy automatico per FE e BE: quando pushi su GitHub, il Pi pulla, builda e (per il BE) fa il restart PM2 — senza SSH manuale.

## Componenti

- `webhook-server.js` — server Node.js (zero dipendenze) che riceve i webhook GitHub
- `deploy-fe.sh` — script di deploy del Frontend
- `deploy-be.sh` — script di deploy del Backend
- `ecosystem.config.js` — config PM2 per il webhook server
- `nginx-snippet.conf` — config Nginx da aggiungere al sito esistente
- `.env.example` — variabili ambiente (copiare in `.env`)

## Sicurezza

- Webhook autenticato con firma HMAC SHA-256 (header `X-Hub-Signature-256`)
- Server in ascolto solo su `127.0.0.1` (esposto solo via Nginx con HTTPS)
- Deploy solo dai branch in whitelist (`ALLOWED_BRANCHES`)
- Lock + coda: niente deploy concorrenti, raffiche di push collassate nell'ultimo commit

---

## Setup sul Raspberry Pi (one-time)

### 1. Pulla questo branch sul Pi

```bash
ssh omniapi@192.168.1.252
cd ~/omniapi/BE
git fetch origin
git checkout claude/awaiting-instructions-Hajn2
git pull origin claude/awaiting-instructions-Hajn2
```

### 2. Crea il file `.env`

```bash
cd ~/omniapi/BE/deploy
cp .env.example .env

# Genera un secret robusto
openssl rand -hex 32

# Apri .env e incolla il secret in WEBHOOK_SECRET
nano .env
```

**Salvati il secret a parte** — ti servirà tra poco su GitHub.

### 3. Rendi eseguibili gli script

```bash
chmod +x ~/omniapi/BE/deploy/*.sh ~/omniapi/BE/deploy/webhook-server.js
mkdir -p ~/omniapi/BE/deploy/logs
```

### 4. Avvia il webhook server con PM2

```bash
cd ~/omniapi/BE/deploy
pm2 start ecosystem.config.js
pm2 save
pm2 logs omniapi-deploy --lines 20
```

Dovresti vedere:
```
webhook server in ascolto su 127.0.0.1:9000
branch consentiti: main, claude/awaiting-instructions-Hajn2
```

### 5. Aggiungi la location a Nginx

Apri la config del sito:
```bash
sudo nano /etc/nginx/sites-available/omniapi
```

Incolla dentro il blocco `server { ... }` HTTPS il contenuto di `nginx-snippet.conf`.

Verifica e ricarica:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

Test rapido (dovrebbe restituire `not found` perché manca repo):
```bash
curl -i https://ofwd.asuscomm.com/webhook/health
```

### 6. Configura i webhook su GitHub

Per **ciascuno** dei due repo (FE e BE):

1. Vai su GitHub → `Settings` → `Webhooks` → `Add webhook`
2. **Payload URL**:
   - FE → `https://ofwd.asuscomm.com/webhook/fe`
   - BE → `https://ofwd.asuscomm.com/webhook/be`
3. **Content type**: `application/json`
4. **Secret**: incolla lo STESSO secret che hai messo in `.env`
5. **SSL verification**: Enable (il tuo certificato Let's Encrypt è valido)
6. **Which events**: `Just the push event`
7. **Active**: ✅
8. `Add webhook`

GitHub manderà un `ping`. Controlla i log:
```bash
pm2 logs omniapi-deploy --lines 10
```
Dovresti vedere `[fe] ping ricevuto da GitHub` (o `[be]`).

---

## Come funziona ogni push

```
1. Pushi su GitHub (branch main o claude/awaiting-instructions-Hajn2)
2. GitHub firma il payload con HMAC-SHA256 e POST su /webhook/{fe,be}
3. Nginx (HTTPS) proxia su 127.0.0.1:9000
4. webhook-server.js verifica la firma, controlla il branch, accetta (HTTP 202)
5. Lancia deploy-fe.sh o deploy-be.sh in background
6. Lo script: git fetch + reset --hard + npm ci + npm run build (+ pm2 restart per BE)
7. Log in deploy/logs/ + visibili con `pm2 logs omniapi-deploy`
```

Se mentre un deploy è in corso arrivano altri push:
- I push intermedi vengono **collassati**: appena il deploy attuale finisce, viene rifatto **una sola volta** con l'ultimo branch ricevuto.
- Nessun rischio di build paralleli o `dist/` corrotti.

---

## Comandi utili

```bash
# Status webhook server
pm2 status omniapi-deploy

# Log live
pm2 logs omniapi-deploy

# Restart manuale (es. dopo modifica .env)
pm2 restart omniapi-deploy

# Stato corrente (deploy in corso? ultimi exit code?)
curl -s http://127.0.0.1:9000/health | jq

# Deploy manuale FE/BE (senza passare da GitHub)
~/omniapi/BE/deploy/deploy-fe.sh claude/awaiting-instructions-Hajn2
~/omniapi/BE/deploy/deploy-be.sh claude/awaiting-instructions-Hajn2
```

---

## Troubleshooting

| Sintomo | Causa probabile | Fix |
|---------|-----------------|-----|
| GitHub mostra `401 invalid signature` | Secret diverso tra `.env` e GitHub | Riallinea i due valori, restart PM2 |
| GitHub mostra `200 branch ignored` | Push su branch non in whitelist | Aggiungi il branch a `ALLOWED_BRANCHES` in `.env` |
| Deploy fallisce con `modifiche locali non committate` | Qualcuno ha editato i file direttamente sul Pi | `git status` nel repo coinvolto, decidere se committare o `git checkout .` |
| `pm2 logs` mostra crash loop | Probabile errore sintassi o porta occupata | Vedi `logs/error.log` |
| Webhook URL restituisce 502 da Nginx | webhook server non in ascolto | `pm2 status`, `pm2 restart omniapi-deploy` |

---

## Disattivare temporaneamente l'auto-deploy

```bash
pm2 stop omniapi-deploy
```

Oppure su GitHub → Webhook → uncheck "Active".
