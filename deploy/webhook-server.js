#!/usr/bin/env node
// OmniaPi auto-deploy webhook server
// Listens for GitHub push events and runs deploy scripts on the Pi.
// Zero external dependencies (only Node.js built-ins).

const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;

// Tiny .env loader (no dotenv dep)
const envPath = path.join(SCRIPT_DIR, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[m[1]] = val;
    }
  });
}

const PORT = parseInt(process.env.WEBHOOK_PORT || '9000', 10);
const SECRET = process.env.WEBHOOK_SECRET;
const ALLOWED_BRANCHES = (process.env.ALLOWED_BRANCHES || 'main,claude/awaiting-instructions-Hajn2')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!SECRET) {
  console.error('FATAL: WEBHOOK_SECRET non impostato (vedi .env.example)');
  process.exit(1);
}

const REPOS = {
  fe: path.join(SCRIPT_DIR, 'deploy-fe.sh'),
  be: path.join(SCRIPT_DIR, 'deploy-be.sh'),
};

// Stato per repo: running + pending (debounce/coda)
const state = {};
Object.keys(REPOS).forEach((k) => {
  state[k] = { running: false, pending: null, lastDeploy: null, lastExit: null };
});

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function verifySignature(body, signature) {
  if (!signature) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function runDeploy(repoKey, branch) {
  const s = state[repoKey];
  if (s.running) {
    s.pending = branch;
    log(`[${repoKey}] deploy in corso, accodato (branch=${branch})`);
    return;
  }
  s.running = true;
  s.lastDeploy = new Date().toISOString();
  log(`[${repoKey}] avvio deploy branch=${branch}`);

  const proc = spawn('bash', [REPOS[repoKey], branch], {
    cwd: SCRIPT_DIR,
    env: { ...process.env, DEPLOY_BRANCH: branch },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', (d) => process.stdout.write(`[${repoKey}] ${d}`));
  proc.stderr.on('data', (d) => process.stderr.write(`[${repoKey}] ${d}`));
  proc.on('exit', (code) => {
    s.running = false;
    s.lastExit = code;
    log(`[${repoKey}] deploy terminato (exit=${code})`);
    if (s.pending) {
      const next = s.pending;
      s.pending = null;
      log(`[${repoKey}] eseguo deploy accodato (branch=${next})`);
      runDeploy(repoKey, next);
    }
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/webhook/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', allowedBranches: ALLOWED_BRANCHES, state }, null, 2));
    return;
  }

  const match = req.url && req.url.match(/^\/webhook\/(fe|be)\/?(\?.*)?$/);
  if (req.method !== 'POST' || !match) {
    res.writeHead(404);
    res.end('not found');
    return;
  }

  const repoKey = match[1];
  const chunks = [];
  let total = 0;

  req.on('data', (c) => {
    total += c.length;
    if (total > 5 * 1024 * 1024) {
      req.destroy();
      return;
    }
    chunks.push(c);
  });

  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const sig = req.headers['x-hub-signature-256'];

    if (!verifySignature(body, sig)) {
      log(`[${repoKey}] firma HMAC non valida, ignoro (IP=${req.socket.remoteAddress})`);
      res.writeHead(401);
      res.end('invalid signature');
      return;
    }

    const event = req.headers['x-github-event'];
    if (event === 'ping') {
      log(`[${repoKey}] ping ricevuto da GitHub`);
      res.writeHead(200);
      res.end('pong');
      return;
    }
    if (event !== 'push') {
      res.writeHead(204);
      res.end();
      return;
    }

    let payload;
    try {
      payload = JSON.parse(body.toString('utf8'));
    } catch {
      res.writeHead(400);
      res.end('bad json');
      return;
    }

    const ref = payload.ref || '';
    const branch = ref.replace(/^refs\/heads\//, '');
    if (!ALLOWED_BRANCHES.includes(branch)) {
      log(`[${repoKey}] push su branch '${branch}' ignorato (allowed: ${ALLOWED_BRANCHES.join(',')})`);
      res.writeHead(200);
      res.end('branch ignored');
      return;
    }

    res.writeHead(202);
    res.end('accepted');
    runDeploy(repoKey, branch);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  log(`webhook server in ascolto su 127.0.0.1:${PORT}`);
  log(`branch consentiti: ${ALLOWED_BRANCHES.join(', ')}`);
  log(`repos: ${Object.keys(REPOS).join(', ')}`);
});

process.on('SIGTERM', () => {
  log('SIGTERM ricevuto, chiusura server');
  server.close(() => process.exit(0));
});
