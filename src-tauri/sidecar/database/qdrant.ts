// Embedded Qdrant using REST API to a local/remote Qdrant instance
// For a fully embedded Node.js vector search without external Qdrant running,
// we could use 'hnswlib-node' or 'vector-db' or purely just fetch against Qdrant.
// Here we define the interface assuming a Qdrant API running locally or initialized via sidecar.

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = 'risk_events';

export async function initQdrant() {
  try {
    // Attempt to create the collection if it doesn't exist
    const checkRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`);
    if (checkRes.status !== 200) {
      const createRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectors: {
            size: 384, // size for all-MiniLM-L6-v2
            distance: 'Cosine'
          }
        })
      });

      if (!createRes.ok) {
        console.error('Failed to create Qdrant collection', await createRes.text());
      }
    }
  } catch (error) {
    console.error('Qdrant init failed (is it running?):', error);
  }
}

export async function storeEmbedding(id: string, vector: number[], payload: Record<string, any>) {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points?wait=true`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [
          { id, vector, payload }
        ]
      })
    });
    if (!res.ok) throw new Error(await res.text());
  } catch (error) {
    console.error('Failed to store embedding:', error);
  }
}

export async function searchEmbeddings(vector: number[], limit: number = 5) {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector,
        limit,
        with_payload: true
      })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.result;
  } catch (error) {
    console.error('Failed to search embeddings:', error);
    return [];
  }
}
