import { Router } from 'express';
import multer from 'multer';
import { requireAdmin, type AuthRequest } from '../middleware/auth.js';
import {
  transcribeQuestionAudio,
  TranscriptionError,
} from '../services/voiceTranscription.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post(
  '/transcribe-question',
  requireAdmin,
  upload.single('audio'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.file?.buffer?.length) {
        res.status(400).json({ error: 'Audio file is required' });
        return;
      }

      const languageField = String(req.body?.language ?? 'en').trim().toLowerCase();
      const language = languageField === 'fr' ? 'fr' : 'en';
      const mimeType = req.file.mimetype || 'audio/webm';

      const transcript = await transcribeQuestionAudio(
        req.file.buffer,
        mimeType,
        language
      );

      res.json({ transcript });
    } catch (err) {
      if (err instanceof TranscriptionError) {
        console.error('transcribe-question error:', err.message);
        res.status(422).json({ error: err.message });
        return;
      }
      console.error('transcribe-question error:', err);
      res.status(500).json({ error: 'Transcription failed' });
    }
  }
);

export default router;
