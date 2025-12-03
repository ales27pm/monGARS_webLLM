import React, { useContext, useMemo, useState } from "react";
import { View, Text, StyleSheet, Platform, Switch } from "react-native";
import VoiceInput from "../components/VoiceInput";
import { palette } from "../theme";
import { ChatContext } from "../context/ChatContext";

const VoiceModeScreen: React.FC = () => {
  const { sendMessage, isGenerating } = useContext(ChatContext);
  const [pushToTalk, setPushToTalk] = useState(true);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [lastTranscript, setLastTranscript] = useState(
    "Aucune requête capturée pour l'instant.",
  );
  const [pendingError, setPendingError] = useState<string | null>(null);

  const platformHint = useMemo(
    () =>
      Platform.OS === "web"
        ? "Utilise le micro navigateur avec fallback clavier."
        : "Optimisé pour micro natif (mobile, tablette, TV).",
    [],
  );

  const handleSpeak = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setPendingError(null);
    setLastTranscript(trimmed);
    try {
      await sendMessage(trimmed);
    } catch (error: any) {
      console.error("Voice send failed", error);
      setPendingError(
        error?.message ||
          "Envoi vocal impossible pour le moment. Réessaie après la génération en cours.",
      );
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mode voix</Text>
      <Text style={styles.subtitle}>{platformHint}</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Push-to-talk</Text>
          <Switch
            value={pushToTalk}
            onValueChange={setPushToTalk}
            trackColor={{ true: palette.accent }}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Sous-titres en direct</Text>
          <Switch
            value={captionsEnabled}
            onValueChange={setCaptionsEnabled}
            trackColor={{ true: palette.accent }}
          />
        </View>
        <VoiceInput
          disabled={isGenerating}
          onSpeak={handleSpeak}
          pushToTalk={pushToTalk}
          captionsEnabled={captionsEnabled}
        />
        <View style={styles.transcriptBox}>
          <Text style={styles.transcriptLabel}>Dernière requête</Text>
          <Text style={styles.transcript}>{lastTranscript}</Text>
          {pendingError ? (
            <Text style={styles.error}>{pendingError}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background, padding: 16 },
  title: {
    color: palette.text,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 4,
  },
  subtitle: { color: palette.muted, marginBottom: 16 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  label: { color: palette.text, fontWeight: "600", fontSize: 16 },
  transcriptBox: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: palette.elevated,
    borderWidth: 1,
    borderColor: palette.border,
  },
  transcriptLabel: { color: palette.muted, fontSize: 12, marginBottom: 4 },
  transcript: { color: palette.text, fontSize: 14, marginBottom: 4 },
  error: { color: palette.error, fontSize: 12 },
});

export default VoiceModeScreen;
