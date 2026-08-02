export class EmbeddingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingsError';
  }
}

/** CockroachDB notes.embedding column is VECTOR(768); Gemini gemini-embedding-001 outputs 768. */
export const STORAGE_EMBEDDING_DIM = 768;

export function padEmbeddingForStorage(embedding: number[]): number[] {
  if (embedding.length === STORAGE_EMBEDDING_DIM) {
    return embedding;
  }
  if (embedding.length > STORAGE_EMBEDDING_DIM) {
    return embedding.slice(0, STORAGE_EMBEDDING_DIM);
  }
  return [...embedding, ...Array(STORAGE_EMBEDDING_DIM - embedding.length).fill(0)];
}

interface GeminiEmbedResponse {
  embedding?: { values?: number[] };
  error?: { message?: string; status?: string };
}

export async function getEmbedding(
  text: string,
  mode: 'document' | 'query' = 'document'
): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new EmbeddingsError('GEMINI_API_KEY is not configured');
  }

  const taskType = mode === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT';

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: 768,
      }),
    }
  );

  const rawBody = await response.text();
  if (!response.ok) {
    let detail = '';
    try {
      const errBody = JSON.parse(rawBody) as GeminiEmbedResponse;
      detail = errBody.error?.message ?? '';
    } catch {
      detail = rawBody.slice(0, 200);
    }
    const suffix = detail ? `: ${detail}` : '';
    throw new EmbeddingsError(`Gemini embedding request failed: ${response.status}${suffix}`);
  }

  let data: GeminiEmbedResponse;
  try {
    data = JSON.parse(rawBody) as GeminiEmbedResponse;
  } catch {
    throw new EmbeddingsError('Gemini returned invalid JSON');
  }

  const embedding = data.embedding?.values;
  if (!embedding?.length) {
    throw new EmbeddingsError('Gemini returned no embedding');
  }

  return embedding;
}
