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

interface CohereEmbedV2Response {
  embeddings?: {
    float?: number[][];
  };
}

function parseCohereErrorBody(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const record = body as Record<string, unknown>;
  if (typeof record.message === 'string') return record.message;
  if (record.error && typeof record.error === 'object') {
    const nested = record.error as Record<string, unknown>;
    if (typeof nested.message === 'string') return nested.message;
  }
  return '';
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

  const response = await fetch('https://api.cohere.com/v2/embed', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      texts: [text],
      model: 'embed-english-v3.0',
      input_type: inputType,
      embedding_types: ['float'],
    }),
  });

  const rawBody = await response.text();
  if (!response.ok) {
    let detail = '';
    try {
      detail = parseCohereErrorBody(JSON.parse(rawBody));
    } catch {
      detail = rawBody.slice(0, 200);
    }
    const suffix = detail ? `: ${detail}` : '';
    if (response.status === 401 || response.status === 403) {
      throw new EmbeddingsError(
        `Cohere embedding request failed: ${response.status} (invalid or expired API key — create a new key at dashboard.cohere.com/api-keys)${suffix}`
      );
    }
    throw new EmbeddingsError(`Cohere embedding request failed: ${response.status}${suffix}`);
  }

  let data: CohereEmbedV2Response;
  try {
    data = JSON.parse(rawBody) as CohereEmbedV2Response;
  } catch {
    throw new EmbeddingsError('Cohere returned invalid JSON');
  }

  const embedding = data.embeddings?.float?.[0];
  if (!embedding?.length) {
    throw new EmbeddingsError('Cohere returned no embedding');
  }

  return embedding;
}
