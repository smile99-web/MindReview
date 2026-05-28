import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUserId } from '@/lib/server-auth';
import { buildLearnerProfile, recommendOptimalSettings, generateActionableSteps } from '@/lib/learner-model';

// GET /api/learner/profile
// Query: ?userId=xxx (optional; falls back to authenticated user)
// Returns aggregated learner profile + recommended settings

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let userId = searchParams.get('userId');

    // Prefer auth token
    const authUserId = getAuthenticatedUserId(req);
    if (authUserId) {
      userId = authUserId;
    }

    if (!userId || userId.trim() === '') {
      return NextResponse.json(
        { error: 'userId query parameter is required when not authenticated' },
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
  } catch (error: any) {
    console.error('[learner/profile]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
