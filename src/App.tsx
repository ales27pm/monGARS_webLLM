import React, { useMemo, useState } from "react";
import { ChatProvider } from "./context/ChatContext";
import HomeScreen from "./screens/HomeScreen";
import VoiceModeScreen from "./screens/VoiceModeScreen";
import SettingsScreen from "./screens/SettingsScreen";
import ReasoningScreen from "./screens/ReasoningScreen";
import CapabilitiesScreen from "./screens/CapabilitiesScreen";
import { palette } from "./theme";
import "../index.css";
import { GlobalErrorBoundary } from "./components/GlobalErrorBoundary";

type ScreenKey = "Home" | "Voice" | "Settings" | "Reasoning" | "Capabilities";

type Navigation = {
  navigate: (screen: ScreenKey) => void;
};

const tabLabels: Record<ScreenKey, string> = {
  Home: "Accueil",
  Voice: "Voix",
  Settings: "Réglages",
  Reasoning: "Raisonnement",
  Capabilities: "Capacités",
};

const AppShell: React.FC = () => {
  const [active, setActive] = useState<ScreenKey>("Home");

  const navigation: Navigation = useMemo(
    () => ({
      navigate: setActive,
    }),
    [],
  );

  const renderScreen = () => {
    switch (active) {
      case "Voice":
        return <VoiceModeScreen navigation={navigation} />;
      case "Settings":
        return <SettingsScreen navigation={navigation} />;
      case "Reasoning":
        return <ReasoningScreen navigation={navigation} />;
      case "Capabilities":
        return <CapabilitiesScreen navigation={navigation} />;
      case "Home":
      default:
        return <HomeScreen navigation={navigation} />;
    }
  };

  return (
    <div style={{ background: palette.background, color: palette.text, minHeight: "100vh" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: `1px solid ${palette.border}`,
          background: palette.surface,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>Mon Gars</span>
          <span style={{ color: palette.muted, fontSize: 13 }}>
            UI multi-écran (web)
          </span>
        </div>
        <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(Object.keys(tabLabels) as ScreenKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setActive(key)}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: `1px solid ${active === key ? palette.accent : palette.border}`,
                background: active === key ? palette.elevated : "transparent",
                color: palette.text,
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {tabLabels[key]}
            </button>
          ))}
        </nav>
      </header>
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 12 }}>{renderScreen()}</main>
    </div>
  );
};

export default function App() {
  return (
    <GlobalErrorBoundary>
      <ChatProvider>
        <AppShell />
      </ChatProvider>
    </GlobalErrorBoundary>
  );
}
