export class EmbeddingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingsError';
  }
}

/** Live DB notes.embedding is VECTOR(1536) (legacy Voyage padding); Cohere outputs 1024 — pad to match. */
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

interface CohereEmbedResponse {
  embeddings?: number[][];
}

export async function getEmbedding(
  text: string,
  mode: 'document' | 'query' = 'document'
): Promise<number[]> {
  const apiKey = process.env.COHERE_API_KEY?.trim();
  if (!apiKey) {
    throw new EmbeddingsError('COHERE_API_KEY is not configured');
  }

  const inputType = mode === 'query' ? 'search_query' : 'search_document';

  const response = await fetch('https://api.cohere.com/v1/embed', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      texts: [text],
      model: 'embed-english-v3.0',
      input_type: inputType,
    }),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const errBody = (await response.json()) as { message?: string };
      detail = errBody.message ?? '';
    } catch {
      // ignore non-JSON error bodies
    }
    const suffix = detail ? `: ${detail}` : '';
    throw new EmbeddingsError(`Cohere embedding request failed: ${response.status}${suffix}`);
  }

  const data = (await response.json()) as CohereEmbedResponse;
  const embedding = data.embeddings?.[0];
  if (!embedding?.length) {
    throw new EmbeddingsError('Cohere returned no embedding');
  }

  return embedding;
}
