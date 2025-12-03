import React from "react";
import { palette } from "../theme";

interface State {
  hasError: boolean;
  message?: string;
}

export class GlobalErrorBoundary extends React.Component<
  React.PropsWithChildren,
  State
> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? "Erreur inconnue" };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Global error boundary caught", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            background: palette.background,
            color: palette.text,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              background: palette.surface,
              border: `1px solid ${palette.border}`,
              borderRadius: 12,
              padding: 24,
              maxWidth: 520,
              width: "100%",
              textAlign: "center",
              boxShadow: "0 6px 24px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
              Une erreur est survenue
            </div>
            <div style={{ color: palette.muted, marginBottom: 16 }}>
              {this.state.message ||
                "Le rendu a échoué. Recharge l'application pour repartir sur une base saine."}
            </div>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                background: palette.accent,
                color: "white",
                border: "none",
                padding: "12px 16px",
                borderRadius: 10,
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Recharger l'application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children as React.ReactElement;
  }
}
