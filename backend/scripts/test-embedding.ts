import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getEmbedding } from '../src/services/embeddings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

try {
  const doc = await getEmbedding('test sentence for document embedding', 'document');
  console.log('document mode — length:', doc.length, 'first values:', doc.slice(0, 5));

  const query = await getEmbedding('test question for query embedding', 'query');
  console.log('query mode — length:', query.length, 'first values:', query.slice(0, 5));
} catch (err) {
  console.error('getEmbedding failed:', err);
  process.exit(1);
}
