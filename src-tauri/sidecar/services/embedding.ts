import { pipeline, env } from '@xenova/transformers';

// Disable remote models if you want to strictly force Local embedding caching,
// but for standard usage allowing download is fine.
// env.allowLocalModels = true;

let extractor: any = null;

export async function initEmbeddingModel() {
  if (extractor) return extractor;
  try {
    // all-MiniLM-L6-v2 is a lightweight model perfect for this Semantic Search
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    return extractor;
  } catch (error) {
    console.error('Failed to init Transformers.js:', error);
    throw error;
  }
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const model = await initEmbeddingModel();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}
