import { spawnSync } from 'node:child_process';

const baseUrl = (process.env.DOCKER_VERIFY_BASE_URL || 'http://localhost:3300').replace(/\/$/, '');
const buildRetries = Number(process.env.DOCKER_VERIFY_BUILD_RETRIES || 2);
const healthTimeoutMs = Number(process.env.DOCKER_VERIFY_HEALTH_TIMEOUT_MS || 120000);
const skipBuild = process.env.DOCKER_VERIFY_SKIP_BUILD === '1';
const skipSmoke = process.env.DOCKER_VERIFY_SKIP_SMOKE === '1';

function run(command, args, options = {}) {
  console.log(`\n$ ${[command, ...args].join(' ')}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      DOCKER_BUILDKIT: process.env.DOCKER_BUILDKIT || '1',
      COMPOSE_DOCKER_CLI_BUILD: process.env.COMPOSE_DOCKER_CLI_BUILD || '1',
      ...options.env,
    },
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

async function waitForHealth() {
  const startedAt = Date.now();
  let lastError = '';

  while (Date.now() - startedAt < healthTimeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, { cache: 'no-store' });
      const data = await response.json().catch(() => null);

      if (response.ok && data?.status === 'ok' && data?.database === 'ok') {
        console.log(`[ok] /api/health ${response.status} ${JSON.stringify(data)}`);
        return;
      }

      lastError = `/api/health returned ${response.status}: ${JSON.stringify(data)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(`Timed out waiting for ${baseUrl}/api/health. Last error: ${lastError}`);
}

async function verifyHomePage() {
  const response = await fetch(`${baseUrl}/`, { cache: 'no-store' });
  if (response.status !== 200) {
    throw new Error(`/ returned ${response.status}, expected HTTP 200`);
  }
  console.log(`[ok] / HTTP ${response.status}`);
}

function buildWithRetry() {
  if (skipBuild) {
    console.log('[skip] Docker build skipped via DOCKER_VERIFY_SKIP_BUILD=1');
    return;
  }

  let lastError;
  for (let attempt = 1; attempt <= buildRetries; attempt += 1) {
    try {
      console.log(`\n== Docker build attempt ${attempt}/${buildRetries} ==`);
      run('docker', ['compose', 'build', 'app']);
      return;
    } catch (error) {
      lastError = error;
      console.error(`[warn] Docker build attempt ${attempt} failed: ${error.message}`);
      if (attempt < buildRetries) {
        console.log('[info] Retrying Docker build...');
      }
    }
  }

  throw lastError;
}

async function main() {
  console.log(`Docker verification target: ${baseUrl}`);
  console.log(`Docker build npm registry: ${process.env.NPM_REGISTRY || 'https://registry.npmmirror.com'}`);

  buildWithRetry();
  run('docker', ['compose', 'up', '-d']);
  run('docker', ['compose', 'ps']);

  await waitForHealth();
  await verifyHomePage();

  if (skipSmoke) {
    console.log('[skip] API smoke skipped via DOCKER_VERIFY_SKIP_SMOKE=1');
  } else {
    run(process.execPath, ['scripts/smoke-api.mjs'], {
      env: { SMOKE_BASE_URL: baseUrl },
    });
  }

  console.log('\nDocker verification completed.');
}

main().catch((error) => {
  console.error(`\n[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
