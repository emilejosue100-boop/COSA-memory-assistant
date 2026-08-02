import { useCallback, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import type { Language } from '../types';
import { getApiBaseUrl, getToken } from '../lib/api';

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
];

function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

function resolveVoiceError(err: unknown, language: Language): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return language === 'en'
        ? 'Microphone access was denied. Allow microphone permission and try again.'
        : 'Accès au microphone refusé. Autorisez le microphone et réessayez.';
    }
    if (err.name === 'NotFoundError') {
      return language === 'en'
        ? 'No microphone was found on this device.'
        : 'Aucun microphone détecté sur cet appareil.';
    }
  }

  return language === 'en'
    ? 'Voice input failed. Please try again or type your question.'
    : 'La saisie vocale a échoué. Réessayez ou saisissez votre question.';
}

interface UseVoiceInputOptions {
  language: Language;
  disabled?: boolean;
}

export function useVoiceInput(
  onTranscript: (text: string) => void,
  { language, disabled = false }: UseVoiceInputOptions
) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef('audio/webm');

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    if (disabled || isRecording || isTranscribing) return;

    setError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError(
        language === 'en'
          ? 'Voice input is not supported in this browser.'
          : 'La saisie vocale n\'est pas prise en charge dans ce navigateur.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickRecorderMimeType();
      mimeTypeRef.current = mimeType || 'audio/webm';

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        cleanupStream();
        setIsRecording(false);

        const audioBlob = new Blob(chunks, {
          type: mimeTypeRef.current || recorder.mimeType || 'audio/webm',
        });

        if (!audioBlob.size) {
          setError(
            language === 'en'
              ? 'No audio was captured. Hold the mic and speak clearly, then stop.'
              : 'Aucun audio capturé. Maintenez le micro, parlez clairement, puis arrêtez.'
          );
          return;
        }

        setIsTranscribing(true);

        try {
          const formData = new FormData();
          const ext = extensionForMime(audioBlob.type);
          formData.append('audio', audioBlob, `question.${ext}`);
          formData.append('language', language);

          const token = getToken();
          const response = await fetch(`${getApiBaseUrl()}/api/transcribe-question`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
          });

          let payload: { transcript?: string; error?: string } = {};
          try {
            payload = (await response.json()) as { transcript?: string; error?: string };
          } catch {
            payload = {};
          }

          if (!response.ok) {
            setError(
              payload.error ??
                (language === 'en'
                  ? 'Transcription failed. Please try again or type your question.'
                  : 'La transcription a échoué. Réessayez ou saisissez votre question.')
            );
            return;
          }

          const transcript = payload.transcript?.trim() ?? '';
          if (!transcript) {
            setError(
              language === 'en'
                ? 'No speech detected. Try speaking closer to the microphone.'
                : 'Aucune parole détectée. Parlez plus près du microphone.'
            );
            return;
          }

          onTranscript(transcript);
        } catch {
          setError(resolveVoiceError(null, language));
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.onerror = () => {
        cleanupStream();
        setIsRecording(false);
        setError(resolveVoiceError(null, language));
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      cleanupStream();
      setIsRecording(false);
      setError(resolveVoiceError(err, language));
    }
  }, [cleanupStream, disabled, isRecording, isTranscribing, language, onTranscript]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    mediaRecorderRef.current = null;
  }, []);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      void startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const clearError = useCallback(() => setError(null), []);

  return {
    isRecording,
    isTranscribing,
    error,
    clearError,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}

interface VoiceMicButtonProps {
  voice: ReturnType<typeof useVoiceInput>;
  language: Language;
  disabled?: boolean;
  className?: string;
}

export function VoiceMicButton({
  voice,
  language,
  disabled = false,
  className = '',
}: VoiceMicButtonProps) {
  const { isRecording, isTranscribing, toggleRecording } = voice;
  const isDisabled = disabled || isTranscribing;

  return (
    <button
      type="button"
      onClick={toggleRecording}
      disabled={isDisabled}
      aria-pressed={isRecording}
      aria-label={
        isRecording
          ? language === 'en'
            ? 'Stop recording'
            : 'Arrêter l\'enregistrement'
          : language === 'en'
            ? 'Record question'
            : 'Enregistrer la question'
      }
      className={`h-11 w-11 flex items-center justify-center rounded-xl border transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
        isRecording
          ? 'border-red-200 bg-red-50 text-error animate-pulse'
          : 'border-border-subtle bg-background text-primary hover:bg-primary/5'
      } ${className}`}
    >
      {isTranscribing ? (
        <Loader2 size={16} className="animate-spin" />
      ) : isRecording ? (
        <Square size={14} className="fill-current" />
      ) : (
        <Mic size={16} />
      )}
    </button>
  );
}
