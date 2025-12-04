import React, { Suspense, useMemo, useState } from "react";
import { ChatProvider } from "./context/ChatContext";
import HomeScreen from "./screens/HomeScreen";
import { palette } from "./theme";
import "../index.css";
import { GlobalErrorBoundary } from "./components/GlobalErrorBoundary";
import AppShell from "./layout/AppShell";
import ResponsivePane from "./layout/ResponsivePane";
import NavigationRail, {
  ScreenKey,
} from "./components/navigation/NavigationRail";

const VoiceModeScreen = React.lazy(() => import("./screens/VoiceModeScreen"));
const SettingsScreen = React.lazy(() => import("./screens/SettingsScreen"));
const ReasoningScreen = React.lazy(() => import("./screens/ReasoningScreen"));
const CapabilitiesScreen = React.lazy(
  () => import("./screens/CapabilitiesScreen"),
);

type Navigation = {
  navigate: (screen: ScreenKey) => void;
};

const tabLabels: Record<ScreenKey, string> = {
  Home: "QG local",
  Voice: "Voix / mains libres",
  Settings: "Réglages monGARS",
  Reasoning: "Traçage raisonnement",
  Capabilities: "Capacités natives",
};

const navItems: { key: ScreenKey; label: string }[] = (
  Object.keys(tabLabels) as ScreenKey[]
).map((key) => ({ key, label: tabLabels[key] }));

const AppNavigator: React.FC = () => {
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
        return (
          <Suspense
            fallback={<LazyScreenFallback label="Module voix" hint="Chargement du pipeline audio local…" />}
          >
            <VoiceModeScreen navigation={navigation} />
          </Suspense>
        );
      case "Settings":
        return (
          <Suspense
            fallback={<LazyScreenFallback label="Réglages" hint="Chargement des panneaux avancés…" />}
          >
            <SettingsScreen navigation={navigation} />
          </Suspense>
        );
      case "Reasoning":
        return (
          <Suspense
            fallback={<LazyScreenFallback label="Traçage" hint="Chargement du module de reasoning…" />}
          >
            <ReasoningScreen navigation={navigation} />
          </Suspense>
        );
      case "Capabilities":
        return (
          <Suspense
            fallback={<LazyScreenFallback label="Capacités" hint="Chargement des capacités locales…" />}
          >
            <CapabilitiesScreen navigation={navigation} />
          </Suspense>
        );
      case "Home":
      default:
        return <HomeScreen navigation={navigation} />;
    }
  };

  return (
    <AppShell
      rail={
        <NavigationRail
          active={active}
          items={navItems}
          onNavigate={setActive}
        />
      }
      bottomNav={
        <NavigationRail
          layout="bottom"
          active={active}
          items={navItems}
          onNavigate={setActive}
        />
      }
    >
      <ResponsivePane variant="primary">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            background: palette.surface,
            border: `1px solid ${palette.border}`,
            borderRadius: 14,
            padding: 12,
            boxSizing: "border-box",
          }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 800 }}>Mon Gars</span>
              <span style={{ color: palette.muted, fontSize: 13 }}>
                UI multi-écran (web)
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {navItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActive(item.key)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: `1px solid ${
                      active === item.key ? palette.accent : palette.border
                    }`,
                    background:
                      active === item.key ? palette.elevated : "transparent",
                    color: palette.text,
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </header>
          <main style={{ maxWidth: 1500, width: "100%" }}>
            {renderScreen()}
          </main>
        </div>
      </ResponsivePane>
    </AppShell>
  );
};

const LazyScreenFallback: React.FC<{ label: string; hint?: string }> = ({
  label,
  hint,
}) => (
  <div
    style={{
      width: "100%",
      minHeight: 220,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: 8,
      color: palette.text,
    }}
  >
    <div style={{ fontWeight: 800, fontSize: 18 }}>
      {label}…
    </div>
    {hint ? <div style={{ color: palette.muted }}>{hint}</div> : null}
  </div>
);

export default function App() {
  return (
    <GlobalErrorBoundary>
      <ChatProvider>
        <AppNavigator />
      </ChatProvider>
    </GlobalErrorBoundary>
  );
}
