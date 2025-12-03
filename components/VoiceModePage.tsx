import React from "react";
import type { EngineStatus, Message } from "../types";
import { useVoiceConversationLoop } from "../useVoiceConversationLoop";

interface VoiceModePageProps {
  onClose: () => void;
  onSend: (text: string) => Promise<void> | void;
  onStop: () => void;
  messages: Message[];
  engineStatus: EngineStatus;
  isGenerating: boolean;
}

export const VoiceModePage: React.FC<VoiceModePageProps> = ({
  onClose,
  onSend,
  onStop,
  messages,
  engineStatus,
  isGenerating,
}) => {
  const {
    autoLoop,
    setAutoLoop,
    autoReadAloud,
    setAutoReadAloud,
    queuedTranscripts,
    setQueuedTranscripts,
    lastAssistantMessage,
    startRecording,
    stopRecording,
    speak,
    stopSpeaking,
    isRecording,
    isTranscribing,
    isSpeaking,
    lastTranscript,
    error,
    vocalModeEnabled,
    setVocalModeEnabled,
    turnState,
    micStateLabel,
    handleManualSend,
    handleClose,
    listeningActive,
    queueCount,
    recentTurns,
  } = useVoiceConversationLoop({
    onClose,
    onSend,
    messages,
    engineStatus,
    isGenerating,
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xl text-white flex flex-col">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[540px] h-[540px] -top-32 -left-24 rounded-full voice-glow" />
        <div className="absolute w-[460px] h-[460px] bottom-[-160px] right-[-120px] rounded-full voice-glow-secondary" />
        <div className="absolute inset-0 voice-grid" />
      </div>

      <div className="relative max-w-6xl w-full mx-auto px-4 py-6 flex-1 flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-wide text-primary-light/80 font-semibold">
              Mode conversation vocale
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold text-white">
              Discute en mains libres avec Mon Gars
            </h2>
            <p className="text-slate-200/80 max-w-2xl mt-1">
              Le moteur écoute, transcrit puis lit les réponses. Le passage de
              tour se fait automatiquement grâce à la détection de silence.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoLoop((prev) => !prev)}
              className={`px-3 py-2 rounded-full text-sm font-medium border transition-colors flex items-center gap-2 ${
                autoLoop
                  ? "bg-emerald-500/20 text-emerald-100 border-emerald-400/50"
                  : "bg-white/10 text-white border-white/20"
              }`}
            >
              <span className="inline-flex h-2 w-2 rounded-full bg-current animate-pulse" />
              {autoLoop ? "Relance auto active" : "Relance auto coupée"}
            </button>
            <button
              onClick={() => setAutoReadAloud((prev) => !prev)}
              className={`px-3 py-2 rounded-full text-sm font-medium border transition-colors flex items-center gap-2 ${
                autoReadAloud
                  ? "bg-primary-DEFAULT/30 text-white border-primary-light/60"
                  : "bg-white/10 text-white border-white/20"
              }`}
            >
              <i className="fa-solid fa-volume-high" />
              {autoReadAloud ? "Lecture auto" : "Lecture manuelle"}
            </button>
            <button
              onClick={handleClose}
              className="px-3 py-2 rounded-full text-sm font-medium border border-white/30 text-white/80 hover:text-white hover:border-white/60 transition-colors"
            >
              <i className="fa-solid fa-xmark" /> Fermer
            </button>
          </div>
        </div>

        <div className="relative flex flex-col items-center gap-6">
          <div className="relative w-44 h-44 flex items-center justify-center">
            <div
              className={`absolute inset-0 rounded-full border border-white/20 transition-opacity ${
                listeningActive
                  ? "animate-voice-ring opacity-100"
                  : "opacity-40"
              }`}
            />
            <div
              className={`absolute inset-3 rounded-full border ${
                isSpeaking
                  ? "border-primary-light/80 animate-voice-ring-slow"
                  : "border-white/10"
              }`}
            />
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={engineStatus !== "ready"}
              className={`relative w-28 h-28 rounded-full flex items-center justify-center text-3xl font-semibold shadow-lg transition-all duration-300 ${
                engineStatus !== "ready"
                  ? "bg-slate-500/60 text-white/60 cursor-not-allowed"
                  : listeningActive
                    ? "bg-error text-white scale-105"
                    : "bg-primary-DEFAULT text-white hover:bg-primary-hover"
              }`}
              title={
                engineStatus !== "ready"
                  ? "Démarre le moteur pour activer la voix"
                  : listeningActive
                    ? "Arrêter l'écoute"
                    : "Commencer l'écoute"
              }
            >
              <i
                className={`fa-solid ${listeningActive ? "fa-microphone-slash" : "fa-microphone"}`}
              />
            </button>
            <div className="absolute -bottom-10 w-full flex items-center justify-center gap-1">
              {Array.from({ length: 8 }).map((_, idx) => (
                <span
                  key={idx}
                  className={`voice-bar ${
                    isSpeaking
                      ? "voice-bar-speaking"
                      : listeningActive
                        ? "voice-bar-listening"
                        : "voice-bar-idle"
                  }`}
                  style={{ animationDelay: `${idx * 0.08}s` }}
                />
              ))}
            </div>
          </div>

          <div className="text-center space-y-2">
            <p className="uppercase text-xs tracking-[0.2em] text-white/70">
              {micStateLabel}
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-white/80">
              <span className="px-2 py-1 bg-white/5 rounded-full border border-white/10 flex items-center gap-2">
                <i className="fa-solid fa-waveform-lines" />
                {vocalModeEnabled
                  ? "Détection de silence active"
                  : "Détection coupée"}
              </span>
              {queueCount > 0 && (
                <span className="px-2 py-1 bg-sky-500/15 border border-sky-400/40 rounded-full text-sky-100 flex items-center gap-2">
                  <i className="fa-solid fa-list-check" /> {queueCount}{" "}
                  dictée(s) en attente
                </span>
              )}
              {engineStatus !== "ready" && (
                <span className="px-2 py-1 bg-amber-500/20 border border-amber-300/40 rounded-full text-amber-100">
                  Démarre le moteur pour utiliser la voix
                </span>
              )}
            </div>
            {lastTranscript && (
              <p className="mt-1 text-white/70 text-sm">
                Dernière dictée :{" "}
                <span className="font-semibold text-white">
                  {lastTranscript}
                </span>
              </p>
            )}
            {error && <p className="text-error text-sm font-medium">{error}</p>}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
            <button
              onClick={() => setVocalModeEnabled((prev) => !prev)}
              className="px-3 py-2 rounded-full bg-white/10 border border-white/20 hover:bg-white/15 transition-colors flex items-center gap-2"
            >
              <i className="fa-solid fa-headset" />
              {vocalModeEnabled ? "Arrêter l'auto-stop" : "Activer l'auto-stop"}
            </button>
            <button
              onClick={stopSpeaking}
              className="px-3 py-2 rounded-full bg-white/10 border border-white/20 hover:bg-white/15 transition-colors flex items-center gap-2"
              disabled={!isSpeaking}
            >
              <i className="fa-solid fa-volume-xmark" />
              Couper la lecture
            </button>
            <button
              onClick={onStop}
              className="px-3 py-2 rounded-full bg-error/80 hover:bg-error transition-colors text-white shadow-lg shadow-error/30 flex items-center gap-2"
            >
              <i className="fa-solid fa-stop" />
              Couper la génération
            </button>
            {!autoReadAloud && lastAssistantMessage?.content && (
              <button
                onClick={() => speak(lastAssistantMessage.content)}
                className="px-3 py-2 rounded-full bg-primary-DEFAULT/80 hover:bg-primary-hover transition-colors text-white shadow-lg shadow-primary-DEFAULT/40 flex items-center gap-2"
              >
                <i className="fa-solid fa-volume-high" /> Lire la dernière
                réponse
              </button>
            )}
            {queueCount > 0 && (
              <button
                onClick={() => setQueuedTranscripts([])}
                className="px-3 py-2 rounded-full bg-white/10 border border-white/20 hover:bg-white/15 transition-colors text-white flex items-center gap-2"
              >
                <i className="fa-solid fa-broom" />
                Vider la file
              </button>
            )}
            {!autoLoop && (
              <button
                onClick={() => startRecording()}
                disabled={engineStatus !== "ready"}
                className="px-3 py-2 rounded-full bg-emerald-500/80 hover:bg-emerald-500 transition-colors text-white shadow-lg shadow-emerald-500/30 flex items-center gap-2 disabled:opacity-50"
              >
                <i className="fa-solid fa-play" /> Relancer l'écoute
              </button>
            )}
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-5 shadow-xl flex flex-col gap-4 overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/70">Tours de parole récents</p>
              <h3 className="text-xl font-semibold">Chronologie vocale</h3>
            </div>
            <button
              onClick={handleManualSend}
              disabled={!lastTranscript || engineStatus !== "ready"}
              className="px-3 py-2 rounded-full bg-white/10 border border-white/20 hover:bg-white/15 transition-colors text-sm disabled:opacity-40"
            >
              Envoyer la dernière dictée
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {recentTurns.length === 0 && (
              <div className="text-white/60 text-sm">
                Parle librement : ta voix sera transcrite et la réponse lue à
                haute voix.
              </div>
            )}
            {recentTurns.map((turn) => (
              <div
                key={turn.id}
                className={`rounded-2xl p-3 border transition-all duration-200 backdrop-blur-sm ${
                  turn.role === "user"
                    ? "bg-white/10 border-white/15"
                    : "bg-primary-DEFAULT/15 border-primary-light/40"
                }`}
              >
                <div className="flex items-center justify-between text-xs text-white/70 mb-1">
                  <span className="flex items-center gap-2 uppercase tracking-wide">
                    <i
                      className={`fa-solid ${turn.role === "user" ? "fa-user" : "fa-robot"}`}
                    />
                    {turn.role === "user" ? "Toi" : "Mon Gars"}
                  </span>
                  <span>{new Date(turn.timestamp).toLocaleTimeString()}</span>
                </div>
                <p className="text-white leading-relaxed">{turn.content}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
