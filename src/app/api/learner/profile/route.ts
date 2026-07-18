import { getErrorMessage } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUserId } from '@/lib/server-auth';
import { buildLearnerProfile, recommendOptimalSettings, generateActionableSteps, runOnboardingDiagnostic } from '@/lib/learner-model';

// GET /api/learner/profile
// Returns aggregated learner profile + recommended settings for the
// authenticated user. The previous `?userId=` query fallback was an IDOR:
// a caller without a valid token (or one forging another user's id) could
// read any user's learner profile.

export async function GET(req: NextRequest) {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      );
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, grade: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Build the learner profile from aggregated data
    const profile = await buildLearnerProfile(userId, prisma);

    // Generate recommended settings
    const recommendations = recommendOptimalSettings(profile);

    // Generate clickable actionable steps
    const actionableSteps = await generateActionableSteps(userId, profile, prisma);

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        grade: user.grade,
      },
      profile,
      recommendations,
      actionableSteps,
    });
  } catch (error: unknown) {
    console.error('[learner/profile]', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Internal server error') },
      { status: 500 },
    );
  }
}

// POST /api/learner/profile — Run onboarding diagnostic
// Body: { userId, grade, subjectId }
// Returns diagnostic results: { score, level, strengths, gaps, ... }
export async function POST(req: NextRequest) {
  try {
    // 非法 JSON / null body 返回 400 而非 500
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: '请求体必须是有效的 JSON 对象' },
        { status: 400 },
      );
    }

    // Always require an authenticated user. The previous version accepted
    // `body.userId` as a fallback, which was an IDOR: a caller without a
    // valid token (e.g., one that slipped past the proxy) could pass any
    // userId and run the diagnostic against another user's account.
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      );
    }

    // typeof 校验而非断言：传 number 等真值类型会透传进诊断逻辑
    const grade = typeof body.grade === 'string' ? body.grade : '';
    const subjectId = typeof body.subjectId === 'string' ? body.subjectId : '';

    if (!grade || !subjectId) {
      return NextResponse.json(
        { error: 'grade and subjectId are required' },
        { status: 400 },
      );
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, grade: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const diagnostic = await runOnboardingDiagnostic(userId, grade, subjectId, prisma);

    return NextResponse.json({
      user: { id: user.id, name: user.name, grade: user.grade },
      diagnostic,
    });
  } catch (error: unknown) {
    console.error('[learner/profile/diagnostic]', error);
    return NextResponse.json(
      { error: getErrorMessage(error, 'Internal server error') },
      { status: 500 },
    );
  }
}
