import { ensurePipeline } from "../../speechPipeline";
import { blobToFloat32AudioData } from "../../speechUtils";

export interface SpeechState {
  mode: "idle" | "listening" | "speaking";
  isRecording: boolean;
  isPlaying: boolean;
  lastError: string | null;
  lastTranscript: string;
}

interface SpeechServiceOptions {
  onStateChange?: (speechState: SpeechState) => void;
  onTranscription?: (text: string) => void | Promise<void>;
}

export class SpeechService {
  private speechState: SpeechState = {
    mode: "idle",
    isRecording: false,
    isPlaying: false,
    lastError: null,
    lastTranscript: "",
  };

  private mediaRecorder: MediaRecorder | null = null;
  private recordingChunks: BlobPart[] = [];
  private recordingStream: MediaStream | null = null;

  private audioContext: AudioContext | null = null;
  private playbackSource: AudioBufferSourceNode | null = null;

  private readonly onStateChange: (speechState: SpeechState) => void;
  private readonly onTranscription: (text: string) => void | Promise<void>;

  private currentTranscriptionAbort: AbortController | null = null;
  private isTranscribing = false;

  constructor(options: SpeechServiceOptions = {}) {
    this.onStateChange = options.onStateChange ?? (() => {});
    this.onTranscription = options.onTranscription ?? (() => {});
  }

  getSpeechState(): SpeechState {
    return this.speechState;
  }

  private setSpeechState(partial: Partial<SpeechState>): void {
    this.speechState = {
      ...this.speechState,
      ...partial,
    };
    this.onStateChange(this.speechState);
  }

  private async ensureAudioContext(): Promise<AudioContext> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
      } catch (e) {
        console.warn("Failed to resume AudioContext", e);
      }
    }
    return this.audioContext;
  }

  private stopPlayback(): void {
    try {
      this.playbackSource?.stop();
    } catch (err) {
      console.warn("stopPlayback failed", err);
    } finally {
      this.playbackSource = null;
    }
  }

  private cleanupRecorder(): void {
    if (this.recordingStream) {
      this.recordingStream.getTracks().forEach((track) => track.stop());
    }
    this.recordingStream = null;
    this.mediaRecorder = null;
    this.recordingChunks = [];
  }

  private async transcribeBlob(
    blob: Blob,
    signal?: AbortSignal,
  ): Promise<string> {
    const asr = await ensurePipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-small",
    );

    let audioData: Float32Array;
    let sampleRate: number;
    try {
      const { audioData: data, sampleRate: rate } = await blobToFloat32AudioData(
        blob,
        await this.ensureAudioContext(),
      );
      audioData = data;
      sampleRate = rate;
    } catch (e) {
      if ((signal as any)?.aborted) return "";
      console.error("Audio decoding failed", e);
      return "";
    }

    try {
      const result = await asr(
        { array: audioData, sampling_rate: sampleRate },
        {
          chunk_length_s: 15,
          stride_length_s: [4, 2],
          signal,
        } as any,
      );
      if (typeof result.text === "string") {
        return result.text.trim();
      }
      return "";
    } catch (e) {
      if ((signal as any)?.aborted) {
        return "";
      }
      console.error("ASR failed", e);
      return "";
    }
  }

  private async handleTranscription(blob: Blob): Promise<void> {
    if (blob.size === 0) {
      this.cleanupRecorder();
      this.setSpeechState({
        lastError: "Aucun audio n'a été capturé.",
        isRecording: false,
        mode: "idle",
      });
      return;
    }

    if (this.isTranscribing) {
      // Cancel the previous one and continue with the latest blob
      this.currentTranscriptionAbort?.abort();
    }

    this.isTranscribing = true;
    const aborter = new AbortController();
    this.currentTranscriptionAbort = aborter;

    try {
      const transcript = await this.transcribeBlob(blob, aborter.signal);
      if (aborter.signal.aborted) return;

      if (!transcript) {
        this.setSpeechState({
          lastError: "La transcription est vide.",
          isRecording: false,
          mode: "idle",
        });
        return;
      }

      this.setSpeechState({
        lastTranscript: transcript,
        lastError: null,
        isRecording: false,
        mode: "idle",
      });

      await this.onTranscription(transcript);
    } catch (err) {
      if (!aborter.signal.aborted) {
        console.error("Transcription error", err);
        this.setSpeechState({
          lastError: "La transcription a échoué. Vérifie le micro ou réessaie.",
          isRecording: false,
          mode: "idle",
        });
      }
    } finally {
      if (this.currentTranscriptionAbort === aborter) {
        this.currentTranscriptionAbort = null;
      }
      this.isTranscribing = false;
    }
  }

  async startSpeechCapture(): Promise<void> {
    if (this.mediaRecorder) return;

    if (this.speechState.mode === "speaking" || this.speechState.isPlaying) {
      await this.stopPlayback();
      this.setSpeechState({ mode: "idle", isPlaying: false });
    }

    const canRecordAudio =
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia;

    if (!canRecordAudio) {
      this.setSpeechState({
        lastError: "La capture audio n'est pas disponible dans ce navigateur.",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.recordingStream = stream;

      let options: MediaRecorderOptions | undefined;
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm")) {
          options = { mimeType: "audio/webm" };
        } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
          options = { mimeType: "audio/ogg" };
        }
      }

      const recorder = new MediaRecorder(stream, options);
      this.recordingChunks = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordingChunks.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error("Recorder error", event);
        this.setSpeechState({
          lastError: "Erreur lors de la capture audio.",
          isRecording: false,
          mode: "idle",
        });
        this.cleanupRecorder();
      };

      recorder.onstop = async () => {
        const blobType =
          options && "mimeType" in options ? (options as any).mimeType : undefined;
        const blob = new Blob(this.recordingChunks, { type: blobType });
        this.cleanupRecorder();
        await this.handleTranscription(blob);
      };

      recorder.start();
      this.mediaRecorder = recorder;
      this.setSpeechState({
        mode: "listening",
        isRecording: true,
        lastError: null,
      });
    } catch (err) {
      console.error("Microphone access failed", err);
      this.setSpeechState({
        lastError: "Impossible d'accéder au micro.",
        isRecording: false,
        mode: "idle",
      });
      this.cleanupRecorder();
    }
  }

  stopSpeechCapture(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    this.currentTranscriptionAbort?.abort();
  }

  async speakText(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    this.stopPlayback();
    this.setSpeechState({
      mode: "speaking",
      isPlaying: true,
      lastError: null,
    });

    try {
      const tts = await ensurePipeline(
        "text-to-speech",
        "Xenova/parler-tts-mini-v1",
      );
      const output = await tts(trimmed, {
        description: "French voice, clear and warm",
      });
      const audioArray = output.audio as Float32Array;
      if (!(audioArray instanceof Float32Array)) {
        throw new Error("TTS output audio is not Float32Array");
      }
      const sampleRate = (output as any).sampling_rate || 22050;
      const audioContext = await this.ensureAudioContext();

      const buffer = audioContext.createBuffer(1, audioArray.length, sampleRate);
      buffer.copyToChannel(audioArray, 0);

      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.onended = () => {
        this.setSpeechState({ mode: "idle", isPlaying: false });
        this.stopPlayback();
      };
      this.playbackSource = source;
      try {
        source.start();
      } catch (e) {
        console.error("AudioBufferSourceNode.start failed", e);
        this.setSpeechState({
          lastError: "Lecture audio indisponible.",
          mode: "idle",
          isPlaying: false,
        });
        this.stopPlayback();
      }
    } catch (err) {
      console.error("TTS error", err);
      this.setSpeechState({
        lastError: "La synthèse vocale a échoué.",
        mode: "idle",
        isPlaying: false,
      });
      this.stopPlayback();
    }
  }

  stopSpeechOutput(): void {
    this.stopPlayback();
    this.setSpeechState({ mode: "idle", isPlaying: false });
  }
}
