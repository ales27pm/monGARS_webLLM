import React from "react";
import CapabilityCard from "../components/CapabilityCard";
import { palette } from "../theme";

const capabilities = [
  {
    title: "LLM local WebLLM",
    description: "Génération de texte directement dans le navigateur via WebGPU avec fallback CPU.",
    badge: "On-device",
  },
  {
    title: "Mémoire sémantique",
    description: "Indexation locale des échanges pour retrouver le contexte pertinent (bientôt activé ici).",
  },
  {
    title: "Mode voix",
    description: "Capture micro, transcription et réponses parlées avec effets visuels adaptatifs.",
  },
  {
    title: "Raisonnement traçable",
    description: "Visualisation des étapes de décision pour expliquer les réponses et les appels outils.",
  },
];

type Props = { navigation: { navigate: (screen: string) => void } };

const CapabilitiesScreen: React.FC<Props> = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 12,
      color: palette.text,
      maxWidth: 1000,
      margin: "0 auto",
      width: "100%",
    }}
  >
    <div>
      <div style={{ fontSize: 24, fontWeight: 800 }}>Capacités</div>
      <div style={{ color: palette.muted }}>
        Comprends ce que Mon Gars peut faire aujourd'hui, optimisé pour le navigateur.
      </div>
    </div>
    <div
      style={{
        display: "grid",
        gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        width: "100%",
      }}
    >
      {capabilities.map((capability) => (
        <CapabilityCard key={capability.title} capability={capability} />
      ))}
    </div>
  </div>
);

export default CapabilitiesScreen;
