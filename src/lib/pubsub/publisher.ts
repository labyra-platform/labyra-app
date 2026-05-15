/**
 * @deprecated Use '@/lib/pubsub/topics/measurement-analysis' instead.
 *
 * Re-export shim from R168-3.1a refactor. Callers will be migrated in
 * R168-3.1b (caller-migration commit). This file scheduled for deletion
 * in R169 once all imports point to the new path.
 *
 * Migration mapping:
 *   from '@/lib/pubsub/publisher'  →  from '@/lib/pubsub/topics/measurement-analysis'
 *   getAuth                        →  from '@/lib/pubsub/auth'
 *
 * R168-3.1a
 */
import 'server-only';

export {
  publishMeasurementAnalysis,
  publishSpectrumAnalysis,
  type MeasurementAnalysisMessage,
  type SpectrumAnalysisMessage
} from './topics/measurement-analysis';

// R167-C2 reused this in jobs/pubsub.ts — preserve export for shim period.
export { getAuth } from './auth';
