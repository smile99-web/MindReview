const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.apiKey.deleteMany({ where: { service: 'embedding' } })
  .then((r) => { console.log('cleared', r.count, 'records'); return p.$disconnect(); })
  .catch((e) => { console.error(e); process.exit(1); });
