import { useCallback, useRef, useState } from "react";
import { pipeline, env } from "@xenova/transformers";

type AudioPipeline = Awaited<ReturnType<typeof pipeline>>;

const ASR_MODEL = "Xenova/whisper-small";
const TTS_MODEL = "Xenova/parler-tts-mini-v1";

env.allowLocalModels = true;

type UseSpeechOptions = {
  onTranscription?: (text: string) => void;
};

type EnsurePipelineFn = (type: string, model: string, options?: Record<string, unknown>) => Promise<AudioPipeline>;

const createPipelineLoader = () => {
  const cache = new Map<string, Promise<AudioPipeline>>();
  const ensurePipeline: EnsurePipelineFn = async (type, model, options) => {
    const key = `${type}:${model}`;
    if (!cache.has(key)) {
      const device = typeof navigator !== "undefined" && navigator.gpu ? "webgpu" : "auto";
      cache.set(
        key,
        pipeline(type as any, model, {
          quantized: true,
          device,
          progress_callback: (status) => {
            console.info(`[speech] ${type} loading`, status);
          },
          ...(options || {}),
        }),
      );
    }
    return cache.get(key)!;
  };
  return ensurePipeline;
};

const ensurePipeline = createPipelineLoader();

export function useSpeech(options: UseSpeechOptions = {}) {
  const { onTranscription } = options;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const ttsSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  };

  const resetTtsPlayback = () => {
    if (ttsSourceRef.current) {
      try {
        ttsSourceRef.current.stop();
      } catch (e) {
        console.warn("Unable to stop previous TTS source", e);
      }
    }
    ttsSourceRef.current = null;
  };

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsRecording(false);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];

        if (blob.size === 0) {
          setError("Aucun audio enregistré.");
          return;
        }

        try {
          setIsTranscribing(true);
          const text = await transcribeBlob(blob);
          setLastTranscript(text);
          onTranscription?.(text);
        } catch (transcriptionError) {
          console.error("Transcription error", transcriptionError);
          setError("La transcription a échoué. Vérifie ton micro et réessaie.");
        } finally {
          setIsTranscribing(false);
          stream.getTracks().forEach((track) => track.stop());
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone permission or initialization failed", err);
      setError("Impossible d'accéder au micro. Vérifie les permissions.");
    }
  }, [onTranscription]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  const transcribeBlob = useCallback(async (blob: Blob) => {
    const asr = await ensurePipeline("automatic-speech-recognition", ASR_MODEL);
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = getAudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const audioData = audioBuffer.getChannelData(0);
    const result = await asr(
      { array: audioData, sampling_rate: audioBuffer.sampleRate },
      {
        chunk_length_s: 15,
        stride_length_s: [4, 2],
        language: "french",
      },
    );

    if (typeof result.text === "string") {
      return result.text.trim();
    }

    return "";
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        return;
      }
      try {
        setError(null);
        setIsSpeaking(true);
        resetTtsPlayback();
        const tts = await ensurePipeline("text-to-speech", TTS_MODEL);
        const output = await tts(text, {
          speaker_id: "parler-tts/multi-speaker", // default speaker embedding
        });
        const audioArray = output.audio as Float32Array;
        const sampleRate = (output as any).sampling_rate || 22050;
        const audioContext = getAudioContext();
        const buffer = audioContext.createBuffer(1, audioArray.length, sampleRate);
        buffer.copyToChannel(audioArray, 0);
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        ttsSourceRef.current = source;
        source.onended = () => {
          setIsSpeaking(false);
          resetTtsPlayback();
        };
        source.start();
      } catch (err) {
        console.error("TTS error", err);
        setIsSpeaking(false);
        setError("La synthèse vocale a échoué. Réessaie ou réduit la longueur du texte.");
      }
    },
    [],
  );

  return {
    startRecording,
    stopRecording,
    speak,
    isRecording,
    isTranscribing,
    isSpeaking,
    lastTranscript,
    error,
  };
}
