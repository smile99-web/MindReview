module.exports = {
  apps: [{
    name: 'mindreview',
    script: '.next/standalone/server.js',
    cwd: '/opt/mindreview',
    env: {
      NODE_ENV: 'production',
      HOSTNAME: '0.0.0.0',
      PORT: 3000,
      DATABASE_URL: 'postgresql://mindreview:mindreview@localhost:5432/mindreview',
      JWT_SECRET_KEY: '***REMOVED-JWT-SECRET***',
      DEEPSEEK_API_KEY: '',
      DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
      DEEPSEEK_MODEL: 'deepseek-chat',
    }
  }]
};
