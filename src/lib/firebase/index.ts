/**
 * Firebase barrel exports
 *
 * Convenience re-exports. Prefer specific imports cho server vs client
 * boundaries để Next.js bundler split đúng.
 */

// Client-side (browser-safe)
export {
  getFirebaseApp,
  getFirebaseAuth,
  getFirebaseDatabase,
  getFirebaseFirestore,
  getFirebaseStorage
} from './client';

// Config (both server + client)
export {
  firebaseAdminConfig,
  firebaseClientConfig,
  validateAdminConfig,
  validateClientConfig
} from './config';

// Note: admin SDK exports KHÔNG re-export ở đây để tránh accidental
// browser imports. Import explicitly: import { ... } from '@/lib/firebase/admin'
