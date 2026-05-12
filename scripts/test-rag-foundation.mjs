#!/usr/bin/env node
/**
 * Smoke test for RAG foundation — verifies all 3 providers respond.
 * Uses REST APIs to avoid SDK ESM compatibility issues.
 */
import { Pinecone } from '@pinecone-database/pinecone';
import { Mistral } from '@mistralai/mistralai';

console.log('=== RAG Foundation Smoke Test ===\n');

async function testVoyage() {
  console.log('1. Voyage AI (embedding)...');
  try {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({
        input: ['Hello from Labyra RAG foundation test.'],
        model: 'voyage-3-large',
        input_type: 'document',
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const dim = data.data[0].embedding.length;
    console.log(`   ✓ embedding dimension: ${dim}`);
    console.log(`   ✓ tokens used: ${data.usage?.total_tokens ?? '?'}`);
    return true;
  } catch (e) {
    console.error(`   ✗ FAIL: ${e.message}`);
    return false;
  }
}

async function testPinecone() {
  console.log('\n2. Pinecone (vector store)...');
  const client = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  try {
    const indexes = await client.listIndexes();
    const names = (indexes.indexes ?? []).map((i) => i.name);
    console.log(`   ✓ connected. Indexes: ${names.length === 0 ? '(none yet)' : names.join(', ')}`);
    const indexName = process.env.PINECONE_INDEX_NAME ?? 'labyra-papers';
    if (!names.includes(indexName)) {
      console.log(`   ! Index '${indexName}' not created yet. Run:`);
      console.log(`     node --env-file=.env.local scripts/init-pinecone-index.mjs`);
    }
    return true;
  } catch (e) {
    console.error(`   ✗ FAIL: ${e.message}`);
    return false;
  }
}

async function testMistral() {
  console.log('\n3. Mistral AI (OCR — verify API key)...');
  const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
  try {
    const models = await client.models.list();
    const count = (models.data ?? []).length;
    console.log(`   ✓ API key valid. ${count} models available.`);
    const hasOcr = (models.data ?? []).some((m) => m.id?.includes('ocr'));
    if (hasOcr) console.log(`   ✓ OCR models found.`);
    return true;
  } catch (e) {
    console.error(`   ✗ FAIL: ${e.message}`);
    return false;
  }
}

const results = await Promise.all([testVoyage(), testPinecone(), testMistral()]);
const passed = results.filter(Boolean).length;
console.log(`\n=== Result: ${passed}/3 providers OK ===`);
process.exit(passed === 3 ? 0 : 1);
