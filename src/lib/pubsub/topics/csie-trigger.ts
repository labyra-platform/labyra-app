/**
 * Domain wrapper: CSIE (cross-spectrum inference) trigger topic.
 *
 * Worker subscriber: labyra-spectra-worker /csie/process endpoint
 * (push subscription csie-push). Worker runs run_csie_for_sample and writes
 * samples/{sampleId}/crossSpectrum/latest. UI useCSIEResult listens live.
 *
 * Topic: 'csie-trigger' (override via PUBSUB_CSIE_TOPIC).
 *
 * @phase R186-4
 * @see ADR-018 async worker architecture
 */
import 'server-only';
import { publishToTopic } from '../publish-to-topic';

const DEFAULT_TOPIC = 'csie-trigger';

function getTopicName(): string {
  return process.env.PUBSUB_CSIE_TOPIC ?? DEFAULT_TOPIC;
}

export interface CsieTriggerMessage {
  tenantId: string;
  sampleId: string;
  /** Skip debounce (manual user refresh). */
  force?: boolean;
}

/**
 * Publish a CSIE compute job. Returns Pub/Sub messageId.
 * Throws typed errors (PubSubPublishError) on failure — caller decides handling.
 */
export async function publishCsieTrigger(msg: CsieTriggerMessage): Promise<string> {
  const { messageId, latencyMs } = await publishToTopic({
    topic: getTopicName(),
    message: { tenantId: msg.tenantId, sampleId: msg.sampleId, force: msg.force ?? false },
    attributes: {
      tenantId: msg.tenantId,
      sampleId: msg.sampleId
    }
  });

  // eslint-disable-next-line no-console -- structured audit log
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'pubsub_csie_enqueued',
      tenantId: msg.tenantId,
      sampleId: msg.sampleId,
      messageId,
      latencyMs,
      topic: getTopicName()
    })
  );

  return messageId;
}
