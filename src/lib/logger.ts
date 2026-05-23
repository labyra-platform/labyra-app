/**
 * Structured JSON logger.
 *
 * Emits one JSON line per log → Vercel runtime log → Cloud Logging.
 * traceId is reserved for future distributed-tracing (A1).
 *
 * removeConsole in prod strips console.* EXCEPT error/warn (see next.config),
 * so logger.error / logger.warn survive in production; info/debug are dev-only.
 *
 * @phase A5
 */
type LogContext = {
  traceId?: string;
  tenantId?: string;
  userId?: string;
  feature?: string;
  costUsd?: number;
  latencyMs?: number;
  [key: string]: unknown;
};

function emit(level: 'info' | 'warn' | 'error', msg: string, ctx?: LogContext): void {
  const line = JSON.stringify({ level, msg, ts: new Date().toISOString(), ...ctx });
  // eslint-disable-next-line no-console -- logger is the single sanctioned console boundary
  if (level === 'error') console.error(line);
  // eslint-disable-next-line no-console -- logger is the single sanctioned console boundary
  else if (level === 'warn') console.warn(line);
  // eslint-disable-next-line no-console -- logger is the single sanctioned console boundary
  else console.log(line);
}

export const logger = {
  info: (msg: string, ctx?: LogContext) => emit('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext) => emit('warn', msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit('error', msg, ctx)
};
