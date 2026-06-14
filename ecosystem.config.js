module.exports = {
  apps: [{
    name: 'mindreview',
    // Next.js 16 standalone 把 server.js 输出在 <project-dir>/ 子目录（用 build 目录名）
    // Mac 上是 .next/standalone/MindReview/server.js（项目目录是 MindReview）
    script: '.next/standalone/MindReview/server.js',
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
