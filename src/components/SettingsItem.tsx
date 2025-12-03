import React from "react";
import { palette } from "../theme";

interface SettingsItemProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
}

const SettingsItem: React.FC<SettingsItemProps> = ({
  title,
  description,
  actionLabel,
  onAction,
  disabled,
}) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 12,
      borderBottom: `1px solid ${palette.border}`,
      color: palette.text,
      gap: 12,
      flexWrap: "wrap",
    }}
  >
    <div>
      <div style={{ fontWeight: 700 }}>{title}</div>
      <div style={{ color: palette.muted, fontSize: 13 }}>{description}</div>
    </div>
    {actionLabel ? (
      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        style={{
          background: disabled ? palette.border : palette.accent,
          color: "white",
          border: "none",
          padding: "10px 12px",
          borderRadius: 10,
          cursor: disabled ? "not-allowed" : "pointer",
          fontWeight: 700,
        }}
      >
        {actionLabel}
      </button>
    ) : null}
  </div>
);

export default SettingsItem;
