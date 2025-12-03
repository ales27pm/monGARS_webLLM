import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from "react-native";
import { ChatContext } from "../context/ChatContext";
import ChatBubble from "../components/ChatBubble";
import InputBar from "../components/InputBar";
import { detectBestGpuBackend } from "../services/GpuService";
import type { GpuCheckResult } from "../services/GpuService.types";
import { palette } from "../theme";

const gpuLabel: Record<GpuCheckResult, string> = {
  webgpu: "WebGPU prêt",
  webgl: "WebGL actif",
  canvas: "Canvas fallback",
  none: "Aucun backend GPU",
};

const gpuTone: Record<GpuCheckResult, string> = {
  webgpu: palette.success,
  webgl: palette.accent,
  canvas: palette.warning,
  none: palette.error,
};

const HomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { messages, sendMessage } = useContext(ChatContext);
  const [gpuStatus, setGpuStatus] = useState<GpuCheckResult>("none");
  const [checkingGpu, setCheckingGpu] = useState(false);

  useEffect(() => {
    let mounted = true;
    setCheckingGpu(true);
    detectBestGpuBackend()
      .then((backend) => {
        if (mounted) setGpuStatus(backend);
      })
      .catch((error) => {
        console.error("GPU detection failed", error);
      })
      .finally(() => {
        if (mounted) setCheckingGpu(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const gpuSubtitle = useMemo(() => {
    if (checkingGpu) return "Analyse de l'accélération matérielle";
    if (Platform.OS === "web" && gpuStatus === "none") {
      return "WebGPU indisponible, bascule en rendu CPU";
    }
    return Platform.OS === "web"
      ? "Optimisé pour WebLLM avec fallback automatique"
      : "Détection native prête pour l'inférence locale";
  }, [checkingGpu, gpuStatus]);

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.heroHeaderRow}>
          <View>
            <Text style={styles.eyebrow}>MON GARS</Text>
            <Text style={styles.title}>Assistant privé sur tous tes appareils.</Text>
            <Text style={styles.subtitle}>
              Compose, parle ou navige à la voix. L'IA s'exécute localement pour protéger tes données.
            </Text>
          </View>
          <View style={[styles.statusPill, { borderColor: gpuTone[gpuStatus] }]}> 
            {checkingGpu ? (
              <ActivityIndicator color={palette.text} />
            ) : (
              <Text style={[styles.statusText, { color: gpuTone[gpuStatus] }]}>{gpuLabel[gpuStatus]}</Text>
            )}
            <Text style={styles.statusCaption}>{gpuSubtitle}</Text>
          </View>
        </View>
        <View style={styles.actionsRow}>
          <QuickAction label="Voice" description="Mode mains libres" onPress={() => navigation.navigate("Voice")} />
          <QuickAction label="Settings" description="Modèles & mémoire" onPress={() => navigation.navigate("Settings")} />
          <QuickAction label="Reasoning" description="Visualiser les chaines" onPress={() => navigation.navigate("Reasoning")} />
          <QuickAction label="Capabilities" description="Forces & limites" onPress={() => navigation.navigate("Capabilities")} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.chatContainer} showsVerticalScrollIndicator={false}>
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Prêt à discuter</Text>
            <Text style={styles.emptySubtitle}>
              Envoie un message texte ou utilise le mode voix. L'assistant s'adapte aux mobiles, TV et desktop.
            </Text>
          </View>
        ) : (
          messages.map((msg) => <ChatBubble key={msg.id} message={msg} />)
        )}
      </ScrollView>
      <InputBar onSend={sendMessage} />
    </View>
  );
};

const QuickAction: React.FC<{ label: string; description: string; onPress: () => void }> = ({
  label,
  description,
  onPress,
}) => (
  <TouchableOpacity style={styles.quickAction} onPress={onPress} accessibilityRole="button">
    <Text style={styles.quickActionLabel}>{label}</Text>
    <Text style={styles.quickActionDescription}>{description}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background },
  hero: { padding: 16, backgroundColor: palette.surface, borderBottomWidth: 1, borderBottomColor: palette.border },
  heroHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  eyebrow: {
    color: palette.muted,
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 1,
  },
  title: { color: palette.text, fontSize: 22, fontWeight: "800", marginTop: 4, marginBottom: 6 },
  subtitle: { color: palette.muted, fontSize: 14, maxWidth: 520 },
  statusPill: {
    minWidth: 170,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: palette.elevated,
  },
  statusText: { fontWeight: "700", fontSize: 14 },
  statusCaption: { color: palette.muted, fontSize: 12, marginTop: 4 },
  actionsRow: {
    flexDirection: "row",
    marginTop: 12,
    flexWrap: "wrap",
  },
  quickAction: {
    backgroundColor: palette.elevated,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    minWidth: 150,
    marginRight: 10,
    marginBottom: 10,
  },
  quickActionLabel: { color: palette.text, fontWeight: "700", fontSize: 15 },
  quickActionDescription: { color: palette.muted, fontSize: 12, marginTop: 4 },
  chatContainer: { padding: 12 },
  emptyState: {
    paddingVertical: 32,
    paddingHorizontal: 16,
    backgroundColor: palette.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  emptyTitle: { color: palette.text, fontWeight: "700", fontSize: 18, marginBottom: 8 },
  emptySubtitle: { color: palette.muted, fontSize: 14 },
});

export default HomeScreen;
