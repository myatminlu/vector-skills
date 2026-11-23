/** Whether a JWT's `exp` claim falls within `withinMs` from now. Unreadable tokens count as expiring. */
export function accessTokenExpiresWithin(token: string, withinMs: number, now = Date.now()): boolean {
  const payload = token.split('.')[1];
  if (!payload) return true;
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: unknown };
    return typeof claims.exp !== 'number' || claims.exp * 1000 <= now + withinMs;
  } catch {
    return true;
  }
}
