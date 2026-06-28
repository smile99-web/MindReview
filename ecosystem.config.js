module.exports = {
  apps: [{
    name: 'mindreview',
    // PM2's --env-file flag and env_file directive both proved
    // unreliable across versions (v5→v7). /opt/mindreview/start.sh
    // is a tiny bash wrapper that does `set -a; source .env; set +a;
    // exec node server.js` — guaranteed to inject JWT_SECRET_KEY,
    // DATABASE_URL, etc. into the process before Next.js boots.
    script: '/opt/mindreview/start.sh',
    cwd: '/opt/mindreview',
    env: {
      NODE_ENV: 'production',
      HOSTNAME: '0.0.0.0',
      PORT: 3000,
      DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
      DEEPSEEK_MODEL: 'deepseek-chat',
    }
  }]
};
