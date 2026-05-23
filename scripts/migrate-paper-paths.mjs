/**
 * migrate-paper-paths.mjs  (Labyra R198-2 / C2 data migration)
 *
 * Di chuyển file PDF trong GCS từ format CŨ sang MỚI, verify md5, update Firestore.
 *
 *   papers/{tid}/{id}.v{N}.pdf       ->  tenants/{tid}/papers/{id}/v{N}.pdf
 *   papers/{tid}/_uploads/{sid}.pdf  ->  tenants/{tid}/papers/_uploads/{sid}.pdf
 *
 * Chạy NGOÀI Next.js nên cần service account credential.
 *
 * ============================================================================
 * THỨ TỰ THỰC THI ĐẦY ĐỦ (làm đúng thứ tự — quan trọng):
 * ============================================================================
 *   0. BACKUP trước:
 *        firebase firestore:export gs://<bucket>/backups/$(date +%F)   # hoặc Console export
 *   1. Dry-run (đọc kế hoạch, KHÔNG ghi):
 *        node ~/LAB-MANAGER/labyra-app/migrate-paper-paths.mjs
 *   2. Apply (copy GCS + verify md5 + update Firestore; GIỮ file cũ để rollback):
 *        node ~/LAB-MANAGER/labyra-app/migrate-paper-paths.mjs --apply
 *   3. Sửa code + rules:
 *        python /mnt/d/labbook-patches/round-198-paper-path-migration-1.py
 *        pnpm build && pnpm lint:strict
 *   4. Deploy rules MỚI (sau khi data đã ở path mới ở bước 2):
 *        firebase deploy --only storage
 *   5. Deploy code:
 *        git add -A && git commit -m "R198 C2: paper path -> tenants/{tid}/papers/" && git push
 *   6. Mở 1 PDF trên prod kiểm tra (data+code+rules đều format mới).
 *   7. CHỈ KHI bước 6 OK — dọn file cũ:
 *        node ~/LAB-MANAGER/labyra-app/migrate-paper-paths.mjs --apply --delete-old
 * ============================================================================
 *
 * CREDENTIAL: script thử theo thứ tự
 *   1. env GOOGLE_APPLICATION_CREDENTIALS  (đường dẫn file JSON)
 *   2. env LABYRA_SA_KEY                   (đường dẫn file JSON)
 *   3. ./serviceAccountKey.json trong repo root
 *   Nếu không thấy -> báo và dừng.
 *
 * BUCKET: đọc từ env NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, fallback <projectId>.appspot.com
 *
 * Tham số:
 *   (mặc định)        dry-run, in kế hoạch, KHÔNG ghi
 *   --apply           thực thi copy + verify + update Firestore (giữ file cũ)
 *   --delete-old      (kèm --apply) xóa file cũ sau khi đã verify path mới tồn tại
 *   --tenant <id>     chỉ migrate 1 tenant (mặc định: tenant-dev-001)
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DELETE_OLD = args.includes('--delete-old');
const tenantArgIdx = args.indexOf('--tenant');
const TENANT = tenantArgIdx >= 0 ? args[tenantArgIdx + 1] : 'tenant-dev-001';

if (DELETE_OLD && !APPLY) {
  console.error('✗ --delete-old phải đi kèm --apply. Dừng.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Credential
// ---------------------------------------------------------------------------
function loadCredentialPath() {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    process.env.LABYRA_SA_KEY,
    resolve(process.cwd(), 'serviceAccountKey.json'),
    resolve(process.env.HOME ?? '', 'LAB-MANAGER/labyra-app/serviceAccountKey.json'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

const keyPath = loadCredentialPath();
if (!keyPath) {
  console.error('✗ Không tìm thấy service account key.');
  console.error('  Set một trong:');
  console.error('    export GOOGLE_APPLICATION_CREDENTIALS=/duong/dan/key.json');
  console.error('    export LABYRA_SA_KEY=/duong/dan/key.json');
  console.error('  Hoặc đặt serviceAccountKey.json ở repo root.');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf-8'));
const projectId = serviceAccount.project_id;

// Bucket resolution (R198 fix): node KHÔNG tự load .env.local như Next,
// và bucket mặc định Firebase mới là {project}.firebasestorage.app (KHÔNG phải .appspot.com).
// Thứ tự: --bucket <name>  ->  env NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET  ->  đọc .env.local  ->  .firebasestorage.app
function readEnvLocalBucket() {
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    if (!existsSync(envPath)) return null;
    const line = readFileSync(envPath, 'utf-8')
      .split('\n')
      .find((l) => l.startsWith('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET='));
    if (!line) return null;
    return line.slice('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET='.length).trim().replace(/^["']|["']$/g, '');
  } catch {
    return null;
  }
}
const bucketArgIdx = args.indexOf('--bucket');
const bucketName =
  (bucketArgIdx >= 0 ? args[bucketArgIdx + 1] : null) ||
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
  readEnvLocalBucket() ||
  `${projectId}.firebasestorage.app`;

initializeApp({
  credential: cert(serviceAccount),
  storageBucket: bucketName,
});

const db = getFirestore();
const bucket = getStorage().bucket();

// ---------------------------------------------------------------------------
// Path transform: CŨ -> MỚI
//   papers/{tid}/{id}.v{N}.pdf      -> tenants/{tid}/papers/{id}/v{N}.pdf
//   papers/{tid}/_uploads/{sid}.pdf -> tenants/{tid}/papers/_uploads/{sid}.pdf
//   (đã ở format mới)               -> trả null (skip)
// ---------------------------------------------------------------------------
function toNewPath(oldPath, tenantId) {
  if (!oldPath) return null;
  if (oldPath.startsWith(`tenants/${tenantId}/papers/`)) return null; // đã mới

  const prefix = `papers/${tenantId}/`;
  if (!oldPath.startsWith(prefix)) return null; // không nhận dạng được, để yên
  const rest = oldPath.slice(prefix.length); // "{id}.v{N}.pdf" hoặc "_uploads/{sid}.pdf"

  if (rest.startsWith('_uploads/')) {
    return `tenants/${tenantId}/papers/${rest}`; // _uploads/{sid}.pdf giữ nguyên đuôi
  }
  // "{id}.v{N}.pdf" -> "{id}/v{N}.pdf"
  const m = rest.match(/^(.+)\.v(\d+)\.pdf$/);
  if (!m) {
    return `tenants/${tenantId}/papers/${rest}`; // dạng lạ — chuyển phẳng, không tách folder
  }
  const [, id, ver] = m;
  return `tenants/${tenantId}/papers/${id}/v${ver}.pdf`;
}

async function md5Of(file) {
  const [meta] = await file.getMetadata();
  return meta.md5Hash ?? null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('='.repeat(64));
  console.log(`Labyra R198 paper path migration  ${APPLY ? '[APPLY]' : '[DRY-RUN]'}`);
  console.log('='.repeat(64));
  console.log(`  project : ${projectId}`);
  console.log(`  bucket  : ${bucketName}`);
  console.log(`  tenant  : ${TENANT}`);
  console.log(`  delete  : ${DELETE_OLD ? 'YES (xóa file cũ)' : 'no (giữ file cũ)'}`);
  console.log('-'.repeat(64));

  const snap = await db.collection(`tenants/${TENANT}/papers`).get();
  console.log(`Tìm thấy ${snap.size} paper trong tenants/${TENANT}/papers\n`);

  let migrated = 0;
  let already = 0;
  let skippedNoFile = 0;
  let failed = 0;
  let deleted = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const oldPath = data.storagePath;
    const id = doc.id;

    if (!oldPath) {
      console.log(`  ⊘ ${id}: KHÔNG có storagePath — bỏ qua`);
      skippedNoFile++;
      continue;
    }

    const newPath = toNewPath(oldPath, TENANT);
    if (!newPath) {
      already++;
      continue; // đã ở format mới hoặc không nhận dạng
    }

    console.log(`  ${id}`);
    console.log(`     cũ : ${oldPath}`);
    console.log(`     mới: ${newPath}`);

    if (!APPLY) {
      // dry-run: chỉ kiểm tra file cũ có tồn tại không, không ghi
      const [oldExists] = await bucket.file(oldPath).exists();
      console.log(`     file cũ tồn tại: ${oldExists ? 'có' : '⚠️ KHÔNG'}`);
      migrated++;
      continue;
    }

    try {
      const oldFile = bucket.file(oldPath);
      const newFile = bucket.file(newPath);

      const [oldExists] = await oldFile.exists();
      const [newExists] = await newFile.exists();

      if (!oldExists && newExists) {
        console.log(`     → file cũ mất, file mới đã có. Chỉ update Firestore.`);
        await doc.ref.update({ storagePath: newPath });
        migrated++;
        continue;
      }
      if (!oldExists && !newExists) {
        console.log(`     ✗ CẢ HAI file đều không tồn tại trong GCS — bỏ qua, KHÔNG đổi Firestore`);
        failed++;
        continue;
      }

      // copy old -> new (nếu new chưa có)
      if (!newExists) {
        await oldFile.copy(newFile);
      }

      // verify md5
      const [oldMd5, newMd5] = await Promise.all([md5Of(oldFile), md5Of(newFile)]);
      if (!oldMd5 || !newMd5 || oldMd5 !== newMd5) {
        console.log(`     ✗ md5 KHÔNG khớp (cũ=${oldMd5} mới=${newMd5}) — KHÔNG đổi Firestore, KHÔNG xóa`);
        failed++;
        continue;
      }
      console.log(`     ✓ md5 khớp (${newMd5})`);

      // update Firestore
      await doc.ref.update({ storagePath: newPath });
      console.log(`     ✓ Firestore storagePath cập nhật`);
      migrated++;

      // xóa file cũ chỉ khi --delete-old VÀ new đã verify
      if (DELETE_OLD) {
        await oldFile.delete();
        console.log(`     ✓ file cũ đã xóa`);
        deleted++;
      }
    } catch (err) {
      console.log(`     ✗ LỖI: ${err?.message ?? err}`);
      failed++;
    }
  }

  console.log('\n' + '-'.repeat(64));
  console.log('Tổng kết:');
  console.log(`  migrate cần xử lý : ${migrated}`);
  console.log(`  đã ở format mới   : ${already}`);
  console.log(`  không có file/path: ${skippedNoFile}`);
  console.log(`  lỗi               : ${failed}`);
  if (DELETE_OLD) console.log(`  file cũ đã xóa    : ${deleted}`);
  console.log('-'.repeat(64));

  if (!APPLY) {
    console.log('\nĐây là DRY-RUN. Chạy lại với --apply để thực thi.');
  } else if (failed > 0) {
    console.log('\n⚠️  Có lỗi. KHÔNG deploy rules cho tới khi xử lý xong các paper lỗi.');
    process.exit(1);
  } else if (!DELETE_OLD) {
    console.log('\n✓ Migrate xong (file cũ vẫn còn để rollback).');
    console.log('  Tiếp: deploy rules + code, mở PDF kiểm tra, rồi chạy --apply --delete-old.');
  } else {
    console.log('\n✓ Hoàn tất, file cũ đã dọn.');
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
