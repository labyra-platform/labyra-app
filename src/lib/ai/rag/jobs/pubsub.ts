/**
 * @deprecated Use '@/lib/pubsub/topics/paper-processing' instead.
 *
 * Re-export shim from R168-3.1a refactor. Callers will be migrated in
 * R168-3.1b. File scheduled for deletion in R169.
 *
 * R168-3.1a
 */
import 'server-only';

export { PubSubQueue, requestPaperCancellation } from '@/lib/pubsub/topics/paper-processing';
