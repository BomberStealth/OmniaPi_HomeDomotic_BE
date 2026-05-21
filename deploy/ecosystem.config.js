// PM2 config per il webhook server di auto-deploy
// Avvio: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'omniapi-deploy',
      script: 'webhook-server.js',
      cwd: __dirname,
      autorestart: true,
      max_memory_restart: '150M',
      max_restarts: 10,
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      time: true,
    },
  ],
};
