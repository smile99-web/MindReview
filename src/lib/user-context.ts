import type { NextRequest } from 'next/server';
import { extractUserIdFromRequest } from '@/lib/server-auth';

/**
 * Resolve the userId from the JWT token in the request's Authorization header.
 * Throws if no valid token is present — auth is enforced by the proxy middleware.
 *
 * This is the ONE function all API routes should call to get the current user.
 */
export async function resolveUserIdFromRequest(req: NextRequest): Promise<string> {
  const jwtUserId = extractUserIdFromRequest(req);
  if (jwtUserId) return jwtUserId;
  throw new Error('Authentication required');
}

/**
 * Resolve a user ID for API routes.
 *
 * If a real userId is provided, return it as-is.
 * Otherwise throws — auth is enforced by the proxy middleware.
 *
 * Prefer resolveUserIdFromRequest(req) in API routes — it automatically
 * reads the JWT token from the Authorization header.
 */
export async function resolveUserId(userId?: string | null): Promise<string> {
  if (userId && userId !== 'default-user') {
    return userId;
  }

  throw new Error('Authentication required');
}
