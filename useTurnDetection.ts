import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type TurnState =
  | "idle"
  | "calibrating"
  | "monitoring"
  | "listening"
  | "silenceHold";

export type TurnDetectionConfig = {
  baseThreshold: number;
  thresholdMultiplier: number;
  silenceMs: number;
  minSpeechMs: number;
  calibrationFrames: number;
};

export type UseTurnDetectionOptions = {
  enabled: boolean;
  stream: MediaStream | null;
  getAudioContext: () => AudioContext;
  onTurnEnded?: () => void;
  config?: Partial<TurnDetectionConfig>;
};

const DEFAULT_TURN_CONFIG: TurnDetectionConfig = {
  baseThreshold: 0.01,
  thresholdMultiplier: 3.5,
  silenceMs: 1200,
  minSpeechMs: 900,
  calibrationFrames: 90,
};

function computeRms(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}

function updateNoiseFloor(
  prev: number,
  rms: number,
  frameCount: number,
): number {
  return (prev * frameCount + rms) / (frameCount + 1);
}

export function useTurnDetection({
  enabled,
  stream,
  getAudioContext,
  onTurnEnded,
  config,
}: UseTurnDetectionOptions) {
  const [turnState, setTurnState] = useState<TurnState>("idle");
  const turnStateRef = useRef<TurnState>("idle");
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const silenceStartedAtRef = useRef<number | null>(null);
  const lastVoiceDetectedAtRef = useRef<number | null>(null);
  const noiseFloorRef = useRef<number>(0);
  const calibrationFramesRef = useRef<number>(0);
  const hasDetectedSpeechRef = useRef<boolean>(false);

  const resolvedConfig = useMemo(
    () => ({ ...DEFAULT_TURN_CONFIG, ...config }),
    [config],
  );

  const setTurn = useCallback((next: TurnState) => {
    turnStateRef.current = next;
    setTurnState(next);
  }, []);

  const cleanup = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (mediaStreamSourceRef.current) {
      mediaStreamSourceRef.current.disconnect();
      mediaStreamSourceRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    silenceStartedAtRef.current = null;
    lastVoiceDetectedAtRef.current = null;
    calibrationFramesRef.current = 0;
    noiseFloorRef.current = 0;
    hasDetectedSpeechRef.current = false;
    setTurn("idle");
  }, [setTurn]);

  useEffect(() => {
    if (!enabled || !stream) {
      cleanup();
      return;
    }

    const audioContext = getAudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    mediaStreamSourceRef.current = source;

    const buffer = new Float32Array(analyser.fftSize);
    silenceStartedAtRef.current = null;
    lastVoiceDetectedAtRef.current = performance.now();
    calibrationFramesRef.current = 0;
    noiseFloorRef.current = 0;
    setTurn("calibrating");

    const step = () => {
      if (!analyserRef.current || !stream.active) {
        cleanup();
        return;
      }

      analyser.getFloatTimeDomainData(buffer);
      const rms = computeRms(buffer);

      if (turnStateRef.current === "calibrating") {
        calibrationFramesRef.current += 1;
        noiseFloorRef.current = updateNoiseFloor(
          noiseFloorRef.current,
          rms,
          calibrationFramesRef.current,
        );

        if (calibrationFramesRef.current >= resolvedConfig.calibrationFrames) {
          setTurn("monitoring");
        } else {
          setTurn("calibrating");
        }
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      const dynamicThreshold = Math.max(
        resolvedConfig.baseThreshold,
        noiseFloorRef.current * resolvedConfig.thresholdMultiplier,
      );
      const now = performance.now();

      if (rms >= dynamicThreshold) {
        if (!hasDetectedSpeechRef.current) {
          hasDetectedSpeechRef.current = true;
        }
        lastVoiceDetectedAtRef.current = now;
        silenceStartedAtRef.current = null;
        if (turnStateRef.current !== "listening") {
          setTurn("listening");
        }
      } else {
        if (!hasDetectedSpeechRef.current) {
          if (turnStateRef.current !== "monitoring") {
            setTurn("monitoring");
          }
          rafRef.current = requestAnimationFrame(step);
          return;
        }

        silenceStartedAtRef.current = silenceStartedAtRef.current ?? now;
        const elapsedSinceSpeech = now - (lastVoiceDetectedAtRef.current ?? now);
        const silenceDuration = now - silenceStartedAtRef.current;

        if (
          elapsedSinceSpeech > resolvedConfig.minSpeechMs &&
          silenceDuration > resolvedConfig.silenceMs
        ) {
          setTurn("silenceHold");
          rafRef.current = null;
          onTurnEnded?.();
          return;
        }

        if (turnStateRef.current !== "silenceHold") {
          setTurn("silenceHold");
        }
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return cleanup;
  }, [
    cleanup,
    enabled,
    getAudioContext,
    onTurnEnded,
    resolvedConfig.baseThreshold,
    resolvedConfig.calibrationFrames,
    resolvedConfig.minSpeechMs,
    resolvedConfig.silenceMs,
    resolvedConfig.thresholdMultiplier,
    stream,
  ]);

  return { turnState };
}
