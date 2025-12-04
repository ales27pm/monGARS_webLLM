type RecognitionCtor = new () => SpeechRecognition;

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

  private recognition: SpeechRecognition | null = null;

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

  private stopPlayback(): void {
    try {
      if (typeof window !== "undefined" && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
    } catch (err) {
      console.warn("stopPlayback failed", err);
    }
  }

  private getRecognitionCtor(): RecognitionCtor | null {
    if (typeof window === "undefined") return null;
    return (
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );
  }

  private startNativeRecognition(): void {
    const RecognitionCtor = this.getRecognitionCtor();
    if (!RecognitionCtor) {
      this.setSpeechState({
        lastError: "La reconnaissance vocale n'est pas disponible.",
      });
      return;
    }

    const recognition = new RecognitionCtor();
    recognition.lang = "fr-FR";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim() ?? "";
      this.setSpeechState({
        lastTranscript: transcript,
        lastError: null,
        isRecording: false,
        mode: "idle",
      });
      this.onTranscription(transcript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Native recognition error", event.error);
      this.setSpeechState({
        lastError:
          "La reconnaissance vocale du navigateur a échoué. Vérifie ton micro et réessaie.",
        isRecording: false,
        mode: "idle",
      });
      this.recognition = null;
    };

    recognition.onend = () => {
      this.setSpeechState({ isRecording: false, mode: "idle" });
      this.recognition = null;
    };

    this.recognition = recognition;
    recognition.start();
    this.setSpeechState({
      mode: "listening",
      isRecording: true,
      lastError: null,
    });
  }

  async startSpeechCapture(): Promise<void> {
    if (this.recognition) return;

    if (this.speechState.mode === "speaking" || this.speechState.isPlaying) {
      await this.stopPlayback();
      this.setSpeechState({ mode: "idle", isPlaying: false });
    }

    this.startNativeRecognition();
  }

  stopSpeechCapture(): void {
    if (this.recognition) {
      try {
        this.recognition.onend = null;
        this.recognition.onerror = null;
        this.recognition.stop();
      } catch (e) {
        console.warn("Failed to stop recognition", e);
      } finally {
        this.recognition = null;
      }
    }
  }

  async speakText(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    this.stopPlayback();

    if (
      typeof window === "undefined" ||
      typeof window.speechSynthesis === "undefined" ||
      typeof (window as any).SpeechSynthesisUtterance === "undefined"
    ) {
      this.setSpeechState({
        lastError: "La synthèse vocale du navigateur n'est pas disponible.",
      });
      return;
    }

    this.setSpeechState({
      mode: "speaking",
      isPlaying: true,
      lastError: null,
    });

    try {
      const utterance = new SpeechSynthesisUtterance(trimmed);
      utterance.lang = "fr-FR";

      utterance.onend = () => {
        this.setSpeechState({ mode: "idle", isPlaying: false });
      };

      utterance.onerror = (event) => {
        console.error("Native TTS error", event.error);
        this.setSpeechState({
          lastError:
            "La synthèse vocale du navigateur a échoué. Réessaie ou vérifie tes paramètres audio.",
          mode: "idle",
          isPlaying: false,
        });
      };

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error("TTS error", err);
      this.setSpeechState({
        lastError: "La synthèse vocale a échoué.",
        mode: "idle",
        isPlaying: false,
      });
    }
  }

  stopSpeechOutput(): void {
    this.stopPlayback();
    this.setSpeechState({ mode: "idle", isPlaying: false });
  }
}
