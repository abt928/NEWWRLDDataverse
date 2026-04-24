export { auth as middleware } from '@/auth';

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - api/auth (NextAuth)
     * - login, signup
     * - share (public share links)
     * - _next/static, _next/image, favicon.ico
     */
    '/((?!api/auth|login|signup|share|_next/static|_next/image|favicon.ico).*)',
  ],
};
