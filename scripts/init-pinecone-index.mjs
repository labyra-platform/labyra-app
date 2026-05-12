#!/usr/bin/env node
/**
 * One-time setup: create Pinecone serverless index for Labyra papers.
 * Dimension 1024 matches Voyage voyage-3-large output.
 *
 * Run from labyra-app root:
 *   node --env-file=.env.local scripts/init-pinecone-index.mjs
 */
import { Pinecone } from '@pinecone-database/pinecone';

const apiKey = process.env.PINECONE_API_KEY;
if (!apiKey) {
  console.error('PINECONE_API_KEY missing in .env.local');
  process.exit(1);
}

const indexName = process.env.PINECONE_INDEX_NAME ?? 'labyra-papers';
const pc = new Pinecone({ apiKey });

async function main() {
  const indexes = await pc.listIndexes();
  const exists = (indexes.indexes ?? []).some((i) => i.name === indexName);

  if (exists) {
    console.log(`✓ Index '${indexName}' already exists`);
    const desc = await pc.describeIndex(indexName);
    console.log(`  dimension: ${desc.dimension}`);
    console.log(`  metric: ${desc.metric}`);
    console.log(`  host: ${desc.host}`);
    return;
  }

  console.log(`Creating index '${indexName}'...`);
  await pc.createIndex({
    name: indexName,
    dimension: 1024,
    metric: 'cosine',
    spec: {
      serverless: {
        cloud: 'aws',
        region: 'us-east-1',
      },
    },
  });

  // Wait for index to be ready
  console.log('Waiting for index to be ready...');
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const desc = await pc.describeIndex(indexName);
    if (desc.status?.ready) {
      ready = true;
      console.log(`✓ Index ready (host: ${desc.host})`);
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!ready) {
    console.error('Index creation timed out');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Failed:', e.message);
  process.exit(1);
});
