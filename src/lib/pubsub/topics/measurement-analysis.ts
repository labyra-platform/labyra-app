/**
 * Domain wrapper: spectra/measurement analysis topic.
 *
 * Worker subscriber: labyra-spectra-worker /spectra/analyze endpoint.
 * Topic: 'spectra-analysis' (override via PUBSUB_SPECTRA_TOPIC).
 *
 * @phase R168-3.1a (extracted from publisher.ts)
 * @see ADR-018 async worker architecture
 */
import 'server-only';
import { publishToTopic } from '../publish-to-topic';

const DEFAULT_TOPIC = 'spectra-analysis';

function getTopicName(): string {
  return process.env.PUBSUB_SPECTRA_TOPIC ?? DEFAULT_TOPIC;
}

/**
 * R164-phase-5b-1: rename SpectrumAnalysisMessage → MeasurementAnalysisMessage.
 * Worker accepts both spectrumId + measurementId fields (back-compat).
 */
export interface MeasurementAnalysisMessage {
  tenantId: string;
  measurementId: string;
  spectrumType: string;
  experimentId?: string;
  /** Firestore collection name. R164: 'measurements'. Legacy: 'spectra'. */
  collection?: 'measurements' | 'spectra';
}

/** @deprecated Use MeasurementAnalysisMessage. */
export type SpectrumAnalysisMessage = MeasurementAnalysisMessage;

/**
 * Publish measurement analysis job.
 *
 * Returns Pub/Sub messageId. Caller decides retry/error handling — this
 * function throws typed errors (PubSubPublishError etc).
 */
export async function publishMeasurementAnalysis(msg: MeasurementAnalysisMessage): Promise<string> {
  if (!msg.collection) msg.collection = 'measurements';

  const { messageId, latencyMs } = await publishToTopic({
    topic: getTopicName(),
    message: msg,
    attributes: {
      tenantId: msg.tenantId,
      spectrumType: msg.spectrumType
    }
  });

  // eslint-disable-next-line no-console -- structured audit log
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'pubsub_measurement_enqueued',
      tenantId: msg.tenantId,
      measurementId: msg.measurementId,
      spectrumType: msg.spectrumType,
      messageId,
      latencyMs,
      topic: getTopicName()
    })
  );

  return messageId;
}

/** @deprecated Use publishMeasurementAnalysis. Kept for legacy spectrumId callers. */
export async function publishSpectrumAnalysis(msg: {
  tenantId: string;
  spectrumId: string;
  spectrumType: string;
  experimentId?: string;
}): Promise<string> {
  return publishMeasurementAnalysis({
    tenantId: msg.tenantId,
    measurementId: msg.spectrumId,
    spectrumType: msg.spectrumType,
    experimentId: msg.experimentId,
    collection: 'measurements'
  });
}
