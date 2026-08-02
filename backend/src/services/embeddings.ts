export class EmbeddingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingsError';
  }
}

/** Live CockroachDB notes.embedding column is vector(1536); voyage-2 outputs 1024. */
export const STORAGE_EMBEDDING_DIM = 1536;

export function padEmbeddingForStorage(embedding: number[]): number[] {
  if (embedding.length === STORAGE_EMBEDDING_DIM) {
    return embedding;
  }
  if (embedding.length > STORAGE_EMBEDDING_DIM) {
    return embedding.slice(0, STORAGE_EMBEDDING_DIM);
  }
  return [...embedding, ...Array(STORAGE_EMBEDDING_DIM - embedding.length).fill(0)];
}

interface VoyageEmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
}

export async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY?.trim();
  if (!apiKey) {
    throw new EmbeddingsError('VOYAGE_API_KEY is not configured');
  }

  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: text, model: 'voyage-2' }),
  });

  if (!response.ok) {
    throw new EmbeddingsError(`Voyage AI request failed: ${response.status}`);
  }

  const data = (await response.json()) as VoyageEmbeddingResponse;
  const embedding = data.data?.[0]?.embedding;
  if (!embedding?.length) {
    throw new EmbeddingsError('Voyage AI returned no embedding');
  }

  return embedding;
}
