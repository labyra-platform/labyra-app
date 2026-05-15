/**
 * Typed errors for Pub/Sub publish surface.
 *
 * Callers can `if (err instanceof PubSubAuthError)` instead of regex on
 * error message. Each error preserves enough context to log + retry decide.
 *
 * @phase R168-3.1a
 */

export class PubSubConfigError extends Error {
  override readonly name = 'PubSubConfigError';
  constructor(message: string) {
    super(`pubsub config: ${message}`);
  }
}

export class PubSubAuthError extends Error {
  override readonly name = 'PubSubAuthError';
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(`pubsub auth: ${message}`);
  }
}

/**
 * Publish failed at HTTP layer. httpStatus + topic + truncated body for
 * structured logging.
 */
export class PubSubPublishError extends Error {
  override readonly name = 'PubSubPublishError';
  constructor(
    public readonly topic: string,
    public readonly httpStatus: number,
    public readonly responseBody: string,
    public readonly cause?: unknown
  ) {
    super(
      `pubsub publish failed [topic=${topic}] HTTP ${httpStatus}: ${responseBody.slice(0, 200)}`
    );
  }
}
