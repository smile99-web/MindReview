module.exports = {
  apps: [{
    name: 'mindreview',
    // Next.js 16 standalone 把 server.js 输出在 <project-dir>/ 子目录（用 build 目录名）
    // Mac 上是 .next/standalone/MindReview/server.js（项目目录是 MindReview）
    script: '.next/standalone/MindReview/server.js',
    cwd: '/opt/mindreview',
    // PM2 5+ supports `env_file`: variables are read from this file and
    // merged into process.env. Used to load DATABASE_URL, JWT_SECRET_KEY,
    // DEEPSEEK_API_KEY without committing them to the public repo.
    // The .env file itself is in .gitignore and managed out-of-band.
    env_file: '/opt/mindreview/.env',
    env: {
      NODE_ENV: 'production',
      HOSTNAME: '0.0.0.0',
      PORT: 3000,
      DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
      DEEPSEEK_MODEL: 'deepseek-chat',
    }
  }]
};
