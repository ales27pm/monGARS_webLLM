import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Platform, Switch } from "react-native";
import VoiceInput from "../components/VoiceInput";
import { palette } from "../theme";

const VoiceModeScreen: React.FC = () => {
  const [pushToTalk, setPushToTalk] = useState(true);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [lastTranscript, setLastTranscript] = useState("Aucune requête capturée pour l'instant.");

  const platformHint = useMemo(
    () =>
      Platform.OS === "web"
        ? "Utilise le micro navigateur avec fallback clavier."
        : "Optimisé pour micro natif (mobile, tablette, TV).",
    [],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mode voix</Text>
      <Text style={styles.subtitle}>{platformHint}</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Push-to-talk</Text>
          <Switch value={pushToTalk} onValueChange={setPushToTalk} trackColor={{ true: palette.accent }} />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Sous-titres en direct</Text>
          <Switch value={captionsEnabled} onValueChange={setCaptionsEnabled} trackColor={{ true: palette.accent }} />
        </View>
        <VoiceInput
          onSpeak={(text) => {
            setLastTranscript(text);
          }}
        />
        <View style={styles.transcriptBox}>
          <Text style={styles.transcriptLabel}>Dernière requête</Text>
          <Text style={styles.transcript}>{lastTranscript}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background, padding: 16 },
  title: { color: palette.text, fontSize: 24, fontWeight: "800", marginBottom: 4 },
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
  transcript: { color: palette.text, fontSize: 14 },
});

export default VoiceModeScreen;
