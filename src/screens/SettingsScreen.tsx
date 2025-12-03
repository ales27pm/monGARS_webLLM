import React from "react";
import SettingsItem from "../components/SettingsItem";
import { palette } from "../theme";
import { useChatContext } from "../context/ChatContext";

type Props = { navigation: { navigate: (screen: string) => void } };

const SettingsScreen: React.FC<Props> = () => {
  const { resetConversation, memoryStats } = useChatContext();
  return (
    <div style={{ color: palette.text, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 24, fontWeight: 800 }}>Réglages</div>
      <div style={{ color: palette.muted }}>Affinage des modèles, mémoire et remise à zéro.</div>
      <div style={{ background: palette.surface, borderRadius: 12, border: `1px solid ${palette.border}` }}>
        <SettingsItem
          title="Réinitialiser la conversation"
          description="Efface l'historique local tout en conservant le modèle chargé."
          actionLabel="Réinitialiser"
          onAction={resetConversation}
        />
        <SettingsItem
          title="Mémoire sémantique"
          description={`Entrées indexées : ${memoryStats.totalEntries}. Dernier score : ${memoryStats.lastHitScore ?? "-"}`}
          disabled
        />
        {memoryStats.totalEntries === 0 ? (
          <div style={{ padding: 12, color: palette.muted, fontSize: 13 }}>
            La mémoire locale sera activée automatiquement lors des prochains échanges.
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default SettingsScreen;
