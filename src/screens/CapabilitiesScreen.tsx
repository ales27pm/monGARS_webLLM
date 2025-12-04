import React from "react";
import CapabilityCard from "../components/CapabilityCard";
import { palette } from "../theme";

const capabilities = [
  {
    title: "LLM local WebLLM",
    description:
      "Texte généré directement sur ta machine via WebGPU, avec fallback CPU si besoin.",
    badge: "On-device",
  },
  {
    title: "Mémoire sémantique",
    description:
      "Indexe les échanges en local pour rappeler le contexte sans lâcher de données (bientôt actif ici).",
  },
  {
    title: "Mode voix",
    description:
      "Capture micro, transcription et réponses parlées avec effets visuels adaptatifs, toujours offline.",
  },
  {
    title: "Raisonnement traçable",
    description:
      "Visualise chaque étape de décision pour expliquer les réponses et les appels outils.",
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
        Tout ce que monGARS sait faire en local, optimisé pour le navigateur.
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
