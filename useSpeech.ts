import { useCallback, useRef, useState } from "react";
import { ensurePipeline } from "./speechPipeline";
import { useAudioPlayback } from "./useAudioPlayback";
import { blobToFloat32AudioData } from "./speechUtils";

type UseSpeechOptions = {
  onTranscription?: (text: string) => void;
};

const ASR_MODEL = "Xenova/whisper-small";
const TTS_MODEL = "Xenova/parler-tts-mini-v1";

type MediaRecorderOptions = ConstructorParameters<typeof MediaRecorder>[1];

export function useSpeech(options: UseSpeechOptions = {}) {
  const { onTranscription } = options;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const {
    getAudioContext,
    sourceRef: ttsSourceRef,
    resetPlayback,
  } = useAudioPlayback();
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastTranscript, setLastTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const hasNativeRecognition =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const hasNativeTts =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined";

  const transcribeBlob = useCallback(
    async (blob: Blob) => {
      const asr = await ensurePipeline(
        "automatic-speech-recognition",
        ASR_MODEL,
      );
      const { audioData, sampleRate } = await blobToFloat32AudioData(
        blob,
        getAudioContext(),
      );
      const result = await asr(
        { array: audioData, sampling_rate: sampleRate },
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
    },
    [getAudioContext],
  );

  const startRecording = useCallback(async () => {
    if (isRecording || isTranscribing) {
      return;
    }

    const canRecordAudio =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia;

    // Prefer native speech recognition when available (Safari/Chrome mobile),
    // as the transformer ASR model is heavier and can fail on low-memory devices.
    if (hasNativeRecognition) {
      try {
        setError(null);
        setIsRecording(true);
        setIsTranscribing(true);

        const RecognitionCtor =
          (window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition;
        const recognition = new RecognitionCtor();
        recognition.lang = "fr-FR";
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          const transcript = event.results?.[0]?.[0]?.transcript || "";
          setLastTranscript(transcript);
          onTranscription?.(transcript);
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error("Native speech recognition error", event.error);
          setIsRecording(false);
          setIsTranscribing(false);
          setError(
            "La transcription vocale du navigateur a échoué. Vérifie ton micro et réessaie.",
          );
        };

        recognition.onend = () => {
          setIsRecording(false);
          setIsTranscribing(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
        return;
      } catch (err) {
        console.error("Native speech recognition failed, falling back", err);
        setError(
          "La dictée vocale native a échoué. Nouvelle tentative avec la transcription locale...",
        );
        recognitionRef.current = null;
        setIsRecording(false);
        setIsTranscribing(false);
      }
    }

    if (!canRecordAudio) {
      setError("La dictée vocale n'est pas disponible sur cet appareil.");
      return;
    }

    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options: MediaRecorderOptions | undefined =
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported("audio/webm")
          ? { mimeType: "audio/webm" }
          : undefined;
      const recorder = new MediaRecorder(stream, options);
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
          stream.getTracks().forEach((track) => track.stop());
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
  }, [
    hasNativeRecognition,
    isRecording,
    isTranscribing,
    onTranscription,
    transcribeBlob,
  ]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsRecording(false);
      setIsTranscribing(false);
      return;
    }

    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        return;
      }

      if (hasNativeTts) {
        try {
          setError(null);
          setIsSpeaking(true);
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = "fr-FR";
          const voices = window.speechSynthesis.getVoices();
          const frenchVoice = voices.find((voice) =>
            voice.lang?.toLowerCase().startsWith("fr"),
          );
          if (frenchVoice) {
            utterance.voice = frenchVoice;
          }
          utterance.onend = () => setIsSpeaking(false);
          utterance.onerror = (event) => {
            console.error("Native TTS error", event.error);
            setIsSpeaking(false);
            setError(
              "La synthèse vocale du navigateur a échoué. Réessaie ou réduis la longueur du texte.",
            );
          };
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
          return;
        } catch (err) {
          console.error("Native TTS failed, falling back", err);
          setIsSpeaking(false);
        }
      }

      try {
        setError(null);
        setIsSpeaking(true);
        resetPlayback();
        const tts = await ensurePipeline("text-to-speech", TTS_MODEL);
        const output = await tts(text, {
          description: "French voice, clear and warm",
        });
        const audioArray = output.audio as Float32Array;
        const sampleRate = (output as any).sampling_rate || 22050;
        const audioContext = getAudioContext();
        const buffer = audioContext.createBuffer(
          1,
          audioArray.length,
          sampleRate,
        );
        buffer.copyToChannel(audioArray, 0);
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        ttsSourceRef.current = source;
        source.onended = () => {
          setIsSpeaking(false);
          resetPlayback();
        };
        source.start();
      } catch (err) {
        console.error("TTS error", err);
        setIsSpeaking(false);
        setError(
          "La synthèse vocale a échoué. Réessaie ou réduit la longueur du texte.",
        );
      }
    },
    [getAudioContext, hasNativeTts, resetPlayback],
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
