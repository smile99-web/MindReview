async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  try {
    const result = await p.apiKey.deleteMany({ where: { service: 'embedding' } });
    console.log('cleared', result.count, 'records');
  } finally {
    await p.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
