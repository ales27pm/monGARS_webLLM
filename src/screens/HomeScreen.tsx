import React, { useContext, useEffect, useMemo, useState } from "react";
import { ChatContext } from "../context/ChatContext";
import ChatBubble from "../components/ChatBubble";
import InputBar from "../components/InputBar";
import { detectGpuMode } from "../services/GpuService";
import type { GpuMode } from "../services/GpuService.types";
import { palette } from "../theme";

type HomeScreenProps = {
  navigation: { navigate: (screen: string) => void };
};

const gpuLabel: Record<GpuMode, string> = {
  webgpu: "WebGPU prêt",
  webgl2: "WebGL2 actif",
  webgl: "WebGL actif",
  none: "Aucun backend GPU",
};

const gpuTone: Record<GpuMode, string> = {
  webgpu: palette.success,
  webgl2: palette.accent,
  webgl: palette.accent,
  none: palette.error,
};

const cardStyle: React.CSSProperties = {
  background: palette.surface,
  border: `1px solid ${palette.border}`,
  borderRadius: 12,
  padding: 16,
};

const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { messages, sendMessage, isGenerating } = useContext(ChatContext);
  const [gpuStatus, setGpuStatus] = useState<GpuMode>("none");
  const [checkingGpu, setCheckingGpu] = useState(false);
  const [gpuError, setGpuError] = useState<string | null>(null);

  const runDetection = () => {
    setGpuError(null);
    setCheckingGpu(true);
    detectGpuMode()
      .then((backend) => {
        setGpuStatus(backend);
      })
      .catch((error: unknown) => {
        console.error("GPU detection failed", error);
        setGpuError(
          "Impossible de détecter l'accélération matérielle. Le rendu repassera en mode logiciel.",
        );
        setGpuStatus("none");
      })
      .finally(() => {
        setCheckingGpu(false);
      });
  };

  useEffect(() => {
    runDetection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gpuSubtitle = useMemo(() => {
    if (checkingGpu) return "Analyse de l'accélération matérielle";
    return "Optimisé pour WebLLM avec fallback automatique";
  }, [checkingGpu]);

  const lastErrorMessage = useMemo(() => {
    const reversed = [...messages].reverse();
    const failing = reversed.find((msg) => msg.error);
    return failing?.content ?? null;
  }, [messages]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ ...cardStyle }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ maxWidth: 640 }}>
            <div style={{ color: palette.muted, fontWeight: 700, fontSize: 12 }}>
              MON GARS
            </div>
            <div style={{ color: palette.text, fontSize: 22, fontWeight: 800 }}>
              Assistant privé sur tous tes appareils.
            </div>
            <div style={{ color: palette.muted, fontSize: 14 }}>
              Compose, parle ou navigue à la voix. L'IA s'exécute localement pour protéger tes données.
            </div>
          </div>
        <div
          style={{
            minWidth: 220,
            border: `1px solid ${palette.border}`,
            borderRadius: 12,
            padding: 12,
            background: palette.elevated,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {checkingGpu ? (
            <div style={{ color: palette.text, fontWeight: 700 }}>Détection GPU…</div>
          ) : gpuError ? (
            <div style={{ color: palette.error, fontWeight: 700 }}>{gpuError}</div>
          ) : (
            <div style={{ color: gpuTone[gpuStatus], fontWeight: 700 }}>
              {gpuLabel[gpuStatus]}
            </div>
          )}
          <div style={{ color: palette.muted, fontSize: 12 }}>{gpuSubtitle}</div>
          {gpuError ? (
            <button
              type="button"
              onClick={runDetection}
              style={{
                alignSelf: "flex-start",
                padding: "6px 10px",
                borderRadius: 8,
                border: `1px solid ${palette.border}`,
                background: "transparent",
                color: palette.text,
                cursor: "pointer",
              }}
            >
              Réessayer
            </button>
          ) : null}
        </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <QuickAction
            label="Voice"
            description="Mode mains libres"
            onClick={() => navigation.navigate("Voice")}
          />
          <QuickAction
            label="Settings"
            description="Modèles & mémoire"
            onClick={() => navigation.navigate("Settings")}
          />
          <QuickAction
            label="Reasoning"
            description="Visualiser les chaînes"
            onClick={() => navigation.navigate("Reasoning")}
          />
          <QuickAction
            label="Capabilities"
            description="Forces & limites"
            onClick={() => navigation.navigate("Capabilities")}
          />
        </div>
      </div>

      <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.length === 0 ? (
          <div>
            <div style={{ color: palette.text, fontWeight: 700, fontSize: 18 }}>
              Prêt à discuter
            </div>
            <div style={{ color: palette.muted, fontSize: 14 }}>
              Envoie un message texte ou utilise le mode voix. L'assistant s'adapte aux mobiles, TV et desktop.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}
        {lastErrorMessage ? (
          <div
            style={{
              background: palette.elevated,
              border: `1px solid ${palette.error}`,
              color: palette.text,
              borderRadius: 10,
              padding: 10,
            }}
          >
            <div style={{ fontWeight: 700, color: palette.error }}>Erreur modèle</div>
            <div style={{ color: palette.muted, marginTop: 4 }}>{lastErrorMessage}</div>
            <button
              type="button"
              onClick={() => runDetection()}
              style={{
                marginTop: 6,
                padding: "6px 10px",
                borderRadius: 8,
                border: `1px solid ${palette.border}`,
                background: "transparent",
                color: palette.text,
                cursor: "pointer",
              }}
            >
              Vérifier le GPU
            </button>
          </div>
        ) : null}
        <div style={{ marginTop: 4 }}>
          <InputBar onSend={sendMessage} disabled={isGenerating} isLoading={isGenerating} />
        </div>
      </div>
    </div>
  );
};

const QuickAction: React.FC<{
  label: string;
  description: string;
  onClick: () => void;
}> = ({ label, description, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      background: palette.elevated,
      padding: 12,
      borderRadius: 10,
      border: `1px solid ${palette.border}`,
      minWidth: 150,
      color: palette.text,
      textAlign: "left",
      cursor: "pointer",
    }}
  >
    <div style={{ fontWeight: 700, fontSize: 15 }}>{label}</div>
    <div style={{ color: palette.muted, fontSize: 12 }}>{description}</div>
  </button>
);

export default HomeScreen;
