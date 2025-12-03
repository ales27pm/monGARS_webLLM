import React, { useEffect, useMemo, useState } from "react";
import VoiceInput from "../components/VoiceInput";
import { palette } from "../theme";
import { useChatContext } from "../context/ChatContext";

type Props = { navigation: { navigate: (screen: string) => void } };

const VoiceModeScreen: React.FC<Props> = () => {
  const [pushToTalk, setPushToTalk] = useState(true);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [lastTranscript, setLastTranscript] = useState(
    "Aucune requête capturée pour l'instant.",
  );
  const {
    speechState,
    startSpeechCapture,
    stopSpeechCapture,
    isGenerating,
  } = useChatContext();

  const listening = speechState.mode === "listening" || speechState.isRecording;
  const speaking = speechState.mode === "speaking" || speechState.isPlaying;
  const speechError = speechState.lastError;

  const platformHint = useMemo(
    () => "Utilise le micro navigateur avec fallback clavier.",
    [],
  );

  useEffect(() => {
    if (speechState.lastTranscript) {
      setLastTranscript(speechState.lastTranscript);
    }
  }, [speechState.lastTranscript]);

  const handleCapture = async () => {
    try {
      if (listening) {
        stopSpeechCapture();
      } else {
        await startSpeechCapture();
      }
    } catch (error) {
      console.error("Voice capture toggle failed", error);
    }
  };

  return (
    <div style={{ color: palette.text, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 24, fontWeight: 800 }}>Mode voix</div>
      <div style={{ color: palette.muted }}>{platformHint}</div>
      {speechError ? (
        <div
          style={{
            background: palette.elevated,
            border: `1px solid ${palette.error}`,
            borderRadius: 10,
            padding: 12,
          }}
        >
          <div style={{ color: palette.error, fontWeight: 700 }}>
            Micro indisponible
          </div>
          <div style={{ color: palette.muted, marginTop: 4 }}>{speechError}</div>
          <div style={{ color: palette.muted, marginTop: 4, fontSize: 12 }}>
            Vérifie les permissions micro ou bascule en saisie texte.
          </div>
        </div>
      ) : null}
      <div
        style={{
          background: palette.surface,
          borderRadius: 12,
          border: `1px solid ${palette.border}`,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          maxWidth: 720,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <Toggle
            label="Push-to-talk"
            value={pushToTalk}
            onChange={setPushToTalk}
          />
          <Toggle
            label="Sous-titres en direct"
            value={captionsEnabled}
            onChange={setCaptionsEnabled}
          />
        </div>
        <VoiceInput
          onCapture={handleCapture}
          speechState={speechState}
          disabled={Boolean(speechError)}
          busy={listening || speaking || isGenerating}
        />
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: palette.elevated,
            border: `1px solid ${palette.border}`,
          }}
        >
          <div style={{ color: palette.muted, fontSize: 12, marginBottom: 4 }}>
            Dernière requête
          </div>
          <div style={{ color: palette.text }}>{lastTranscript}</div>
          <div style={{ color: palette.muted, fontSize: 12, marginTop: 6 }}>
            {listening
              ? "Écoute en cours…"
              : speaking
                ? "Synthèse vocale en cours…"
                : "Prêt pour une nouvelle capture."}
          </div>
        </div>
      </div>
    </div>
  );
};

const Toggle: React.FC<{
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, value, onChange }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 8, color: palette.text }}>
    <input
      type="checkbox"
      checked={value}
      onChange={(e) => onChange(e.target.checked)}
      style={{ width: 18, height: 18 }}
    />
    <span>{label}</span>
  </label>
);

export default VoiceModeScreen;
