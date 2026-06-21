module.exports = {
  apps: [{
    name: 'mindreview',
    // Next.js 16 standalone 把 server.js 输出在 <project-dir>/ 子目录（用 build 目录名）
    // Mac 上是 .next/standalone/MindReview/server.js（项目目录是 MindReview）
    script: '.next/standalone/MindReview/server.js',
    cwd: '/opt/mindreview',
    // Load /opt/mindreview/.env via Node's built-in --env-file flag
    // (available since Node 20.6). This is more reliable than PM2's
    // `env_file` directive which is inconsistently applied across
    // versions. The .env file is in .gitignore and contains the secrets
    // that used to be hardcoded here (DATABASE_URL, JWT_SECRET_KEY,
    // DEEPSEEK_API_KEY, etc.).
    node_args: ['--env-file=/opt/mindreview/.env'],
    env: {
      NODE_ENV: 'production',
      HOSTNAME: '0.0.0.0',
      PORT: 3000,
      DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
      DEEPSEEK_MODEL: 'deepseek-chat',
    }
  }]
};
