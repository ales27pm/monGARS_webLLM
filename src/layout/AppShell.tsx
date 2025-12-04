import React from "react";
import { palette } from "../theme";
import "./layout.css";

type AppShellProps = {
  children: React.ReactNode;
  rail?: React.ReactNode;
  bottomNav?: React.ReactNode;
};

const AppShell: React.FC<AppShellProps> = ({ children, rail, bottomNav }) => {
  const shellStyle: React.CSSProperties = {
    background: palette.background,
    color: palette.text,
    minHeight: "100vh",
    "--app-surface": palette.surface,
    "--app-border": palette.border,
    "--app-text": palette.text,
    "--app-accent": palette.accent,
    "--app-muted": palette.muted,
  } as React.CSSProperties;

  return (
    <div className="app-shell" style={shellStyle}>
      <div className="app-shell__body">
        {rail ? (
          <aside className="app-shell__rail" aria-label="Navigation principale">
            {rail}
          </aside>
        ) : null}
        <div className="app-shell__content">{children}</div>
      </div>
      {bottomNav ? <div className="app-shell__bottom">{bottomNav}</div> : null}
    </div>
  );
};

export default AppShell;
