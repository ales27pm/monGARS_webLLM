import { useRef } from "react";

export function useAudioPlayback() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  };

  const resetPlayback = () => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch (e) {
        console.warn("Unable to stop previous audio source", e);
      }
    }
    sourceRef.current = null;
  };

  return { getAudioContext, sourceRef, resetPlayback };
}
