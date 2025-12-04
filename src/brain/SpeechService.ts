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

  private async transcribeBlob(blob: Blob): Promise<string> {
    const asr = await ensurePipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-small",
    );

    const audioContext = await this.ensureAudioContext();
    const { audioData, sampleRate } = await blobToFloat32AudioData(
      blob,
      audioContext,
    );

    const result = await asr(
      { array: audioData, sampling_rate: sampleRate },
      {
        chunk_length_s: 15,
        stride_length_s: [4, 2],
      },
    );

    if (typeof result.text === "string") {
      return result.text.trim();
    }

    return "";
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
      const sampleRate = (output as any).sampling_rate || 22050;
      const audioContext = await this.ensureAudioContext();

      const buffer = audioContext.createBuffer(
        1,
        audioArray.length,
        sampleRate,
      );
      buffer.copyToChannel(audioArray, 0);

      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.onended = () => {
        this.setSpeechState({ mode: "idle", isPlaying: false });
        this.stopPlayback();
      };
      this.playbackSource = source;
      source.start();
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

  async startSpeechCapture(): Promise<void> {
    if (this.mediaRecorder) return;

    // Prevent capturing while speaking; stop any playback first
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

      const options: MediaRecorderOptions | undefined =
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported("audio/webm")
          ? { mimeType: "audio/webm" }
          : undefined;

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
        const blob = new Blob(this.recordingChunks, { type: "audio/webm" });
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

  private cleanupRecorder(): void {
    if (this.recordingStream) {
      this.recordingStream.getTracks().forEach((track) => track.stop());
    }
    this.recordingStream = null;
    this.mediaRecorder = null;
    this.recordingChunks = [];
  }

  private async transcribeBlob(blob: Blob): Promise<string> {
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
      console.error("Audio decoding failed", e);
      return "";
    }

    const result = await asr(
      { array: audioData, sampling_rate: sampleRate },
      {
        chunk_length_s: 15,
        stride_length_s: [4, 2],
      },
    );

    if (typeof result.text === "string") {
      return result.text.trim();
    }

    return "";
  }

  private isTranscribing = false;

  private async handleTranscription(blob: Blob): Promise<void> {
    if (blob.size === 0) {
      this.setSpeechState({
        lastError: "Aucun audio n'a été capturé.",
        isRecording: false,
        mode: "idle",
      });
      return;
    }

    if (this.isTranscribing) {
      // Drop or queue behavior; here we drop to avoid overlap
      console.warn("Transcription already in progress, dropping new blob.");
      return;
    }

    this.isTranscribing = true;
    try {
      const transcript = await this.transcribeBlob(blob);
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
      console.error("Transcription error", err);
      this.setSpeechState({
        lastError: "La transcription a échoué. Vérifie le micro ou réessaie.",
        isRecording: false,
        mode: "idle",
      });
    } finally {
      this.isTranscribing = false;
    }
  }

  async startSpeechCapture(): Promise<void> {
    if (this.mediaRecorder) return;

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

      const options: MediaRecorderOptions | undefined =
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported("audio/webm")
          ? { mimeType: "audio/webm" }
          : undefined;

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
        const blob = new Blob(this.recordingChunks, { type: "audio/webm" });
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
