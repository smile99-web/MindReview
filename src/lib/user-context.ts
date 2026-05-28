import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractUserIdFromRequest } from '@/lib/server-auth';

/**
 * Resolve the userId from the JWT token in the request's Authorization header.
 * Falls back to the DB fallback (first user) if no valid token is present.
 *
 * This is the ONE function all API routes should call to get the current user.
 * It tries JWT auth first, then the DB fallback for backward compatibility.
 */
export async function resolveUserIdFromRequest(req: NextRequest): Promise<string> {
  const jwtUserId = extractUserIdFromRequest(req);
  if (jwtUserId) return jwtUserId;
  return resolveUserId(null);
}

/**
 * Resolve a user ID for API routes.
 *
 * If a real userId is provided, return it as-is.
 * Otherwise, find the first user in the database and return their ID.
 * Throws if no users exist at all (the app requires at least one user).
 *
 * Prefer resolveUserIdFromRequest(req) in API routes — it automatically
 * reads the JWT token from the Authorization header.
 */
export async function resolveUserId(userId?: string | null): Promise<string> {
  // If a real, non-default userId was provided, use it directly
  if (userId && userId !== 'default-user') {
    return userId;
  }

  // Fall back to the first user in the database
  console.warn(
    '[user-context] No valid userId provided; falling back to first user in DB. ' +
      'This is a temporary measure until auth middleware is fully rolled out.',
  );

  const defaultUser = await prisma.user.findFirst({
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!defaultUser) {
    throw new Error(
      'No users exist in the database. Please create a user first ' +
        'or provide a valid userId.',
    );
  }

  return defaultUser.id;
}
