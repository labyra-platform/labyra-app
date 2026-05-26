/**
 * Session cookie naming shared by the setter (session route), the edge proxy,
 * and server-side reads. The `__Host-` prefix REQUIRES Secure + HTTPS, which a
 * local `http://localhost` dev server can't satisfy — the browser silently
 * drops such cookies, breaking login in dev. So we use the hardened name only
 * in production and a plain name (no Secure) in development.
 *
 * @phase R209 (auth dev cookie fix)
 */

// Edge-runtime safe: process.env.NODE_ENV is statically inlined by Next.
const isProd = process.env.NODE_ENV === 'production';

/** `__Host-session` in production (hardened), `session` in dev (HTTP localhost). */
export const SESSION_COOKIE_NAME = isProd ? '__Host-session' : 'session';

/** Secure flag — only on HTTPS (production). `__Host-` also implies Secure. */
export const SESSION_COOKIE_SECURE = isProd;
