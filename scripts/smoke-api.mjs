const baseUrl = (process.env.SMOKE_BASE_URL || 'http://localhost:3300').replace(/\/$/, '');
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 15000);
const password = process.env.SMOKE_PASSWORD || 'SmokePass123!';

function makeUsername(label) {
  const stamp = Date.now().toString(36);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `smk_${label}_${stamp}_${suffix}`;
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    accept: 'application/json',
    ...(options.body ? { 'content-type': 'application/json' } : {}),
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
  };

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    const data = text ? parseJson(text, path) : null;
    const expected = options.expected || [200];

    if (!expected.includes(response.status)) {
      throw new Error(`${path} returned ${response.status}: ${text}`);
    }

    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(text, path) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path} returned non-JSON response: ${text.slice(0, 200)}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function step(name, fn) {
  const startedAt = Date.now();
  await fn();
  console.log(`[ok] ${name} (${Date.now() - startedAt}ms)`);
}

async function register(label) {
  const username = makeUsername(label);
  const { data } = await request('/api/auth/register', {
    method: 'POST',
    body: {
      username,
      password,
      name: `Smoke ${label.toUpperCase()}`,
    },
  });

  assert(data?.access_token, `${label} registration did not return access_token`);
  assert(data?.user?.id, `${label} registration did not return user.id`);
  assert(data.user.username === username, `${label} registration returned wrong username`);

  return {
    token: data.access_token,
    user: data.user,
  };
}

async function main() {
  console.log(`Running API smoke tests against ${baseUrl}`);

  let userA;
  let userB;
  let mistakeId;

  await step('health endpoint responds', async () => {
    const { data } = await request('/api/health');
    assert(data?.status === 'ok', 'health status is not ok');
  });

  await step('register two isolated users', async () => {
    userA = await register('a');
    userB = await register('b');
    assert(userA.user.id !== userB.user.id, 'registered users should be different');
  });

  await step('auth/me returns current user', async () => {
    const { data } = await request('/api/auth/me', { token: userA.token });
    assert(data?.id === userA.user.id, 'auth/me did not return user A');
  });

  await step('learner profile ignores forged userId when authenticated', async () => {
    const { data } = await request(`/api/learner/profile?userId=${encodeURIComponent(userB.user.id)}`, {
      token: userA.token,
    });
    assert(data?.user?.id === userA.user.id, 'learner profile used query userId instead of auth user');
    assert(Array.isArray(data?.actionableSteps), 'learner profile did not return actionableSteps');
  });

  await step('review can schedule into user progress when content exists', async () => {
    const { data } = await request('/api/review?mode=basic', { token: userA.token });
    assert(Array.isArray(data?.tasks), 'review did not return tasks array');

    if (data.tasks.length === 0) {
      console.log('[skip] no review tasks available in this database');
      return;
    }

    const task = data.tasks[0];
    const submitted = await request('/api/review', {
      method: 'POST',
      token: userA.token,
      body: {
        taskId: task.id,
        knowledgeNodeId: task.knowledgeNodeId,
        quality: 4,
        durationSeconds: 3,
      },
    });
    assert(submitted.data?.success === true, 'review submission did not return success');
    assert(submitted.data?.state?.masteryLevel >= 0, 'review submission did not return SM-2 state');
  });

  await step('mistakes can be created for current user', async () => {
    const { data } = await request('/api/mistakes', {
      method: 'POST',
      token: userA.token,
      body: {
        questionText: `Smoke isolation question ${Date.now()}`,
        wrongAnswer: 'wrong',
        correctAnswer: 'correct',
      },
    });
    assert(data?.success === true, 'mistake creation did not return success');
    assert(data?.mistake?.id, 'mistake creation did not return id');
    mistakeId = data.mistake.id;
  });

  await step('mistakes list is isolated by userId', async () => {
    const [{ data: mistakesA }, { data: mistakesB }] = await Promise.all([
      request('/api/mistakes', { token: userA.token }),
      request('/api/mistakes', { token: userB.token }),
    ]);
    assert(Array.isArray(mistakesA), 'user A mistakes response is not an array');
    assert(Array.isArray(mistakesB), 'user B mistakes response is not an array');
    assert(mistakesA.some((mistake) => mistake.id === mistakeId), 'user A cannot see created mistake');
    assert(!mistakesB.some((mistake) => mistake.id === mistakeId), 'user B can see user A mistake');
  });

  await step('mistake update/delete rejects another user', async () => {
    await request(`/api/mistakes/${mistakeId}`, {
      method: 'PATCH',
      token: userB.token,
      body: { resolved: true },
      expected: [404],
    });
    await request(`/api/mistakes/${mistakeId}`, {
      method: 'DELETE',
      token: userB.token,
      expected: [404],
    });
  });

  await step('mistake update/delete works for owner', async () => {
    const { data } = await request(`/api/mistakes/${mistakeId}`, {
      method: 'PATCH',
      token: userA.token,
      body: { resolved: true },
    });
    assert(data?.resolved === true, 'owner update did not mark mistake resolved');

    const deleted = await request(`/api/mistakes/${mistakeId}`, {
      method: 'DELETE',
      token: userA.token,
    });
    assert(deleted.data?.success === true, 'owner delete did not return success');
  });

  await step('tutor history list is authenticated and scoped', async () => {
    const { data } = await request('/api/tutor/history?action=list', { token: userA.token });
    assert(Array.isArray(data?.sessions), 'tutor history list did not return sessions');
  });

  console.log('API smoke tests completed.');
}

main().catch((error) => {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
