const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_WHISPER_MODEL = 'whisper-large-v3';

export class TranscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
}

export async function transcribeQuestionAudio(
  buffer: Buffer,
  mimeType: string,
  language: 'en' | 'fr'
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new TranscriptionError(
      'Voice transcription is not configured (set GROQ_API_KEY in backend/.env)'
    );
  }

  const ext = extensionForMime(mimeType);
  const audioBlob = new Blob([buffer], {
    type: mimeType || 'application/octet-stream',
  });

  const formData = new FormData();
  formData.append('file', audioBlob, `question.${ext}`);
  formData.append('model', GROQ_WHISPER_MODEL);
  formData.append('language', language);
  formData.append('response_format', 'json');

  let response: Response;
  try {
    response = await fetch(GROQ_TRANSCRIBE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });
  } catch {
    throw new TranscriptionError('Could not reach Groq transcription service');
  }

  let payload: { text?: string; error?: { message?: string } } = {};
  const raw = await response.text();
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw) as { text?: string; error?: { message?: string } };
    } catch {
      throw new TranscriptionError(
        response.ok
          ? 'Groq returned an invalid transcription response'
          : `Groq transcription failed (${response.status})`
      );
    }
  }

  if (!response.ok) {
    const detail =
      payload.error?.message?.trim() || `Groq transcription failed (${response.status})`;
    throw new TranscriptionError(detail);
  }

  const transcript = payload.text?.trim() ?? '';
  if (!transcript) {
    throw new TranscriptionError('No speech detected in recording');
  }

  return transcript;
}
