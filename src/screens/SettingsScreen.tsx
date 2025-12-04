import React from "react";
import SettingsItem from "../components/SettingsItem";
import { palette } from "../theme";
import { useChatContext } from "../context/ChatContext";

type Props = { navigation: { navigate: (screen: string) => void } };

const SettingsScreen: React.FC<Props> = () => {
  const { resetConversation, memoryStats } = useChatContext();
  return (
    <div
      style={{
        color: palette.text,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 800 }}>Réglages monGARS</div>
      <div style={{ color: palette.muted }}>
        Affine les modèles, pilote la mémoire et reset en local.
      </div>
      <div
        style={{
          background: palette.surface,
          borderRadius: 12,
          border: `1px solid ${palette.border}`,
        }}
      >
        <SettingsItem
          title="Purgez la session"
          description="Efface l'historique local tout en gardant le modèle déjà chargé."
          actionLabel="Nettoyer"
          onAction={resetConversation}
        />
        <SettingsItem
          title="Mémoire sémantique"
          description={`Entrées indexées : ${memoryStats.totalEntries}. Dernier score : ${memoryStats.lastHitScore ?? "-"}`}
          disabled
        />
        {memoryStats.totalEntries === 0 ? (
          <div style={{ padding: 12, color: palette.muted, fontSize: 13 }}>
            La mémoire locale se déclenchera dès les prochains échanges, rien ne
            sort de ton device.
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default SettingsScreen;
