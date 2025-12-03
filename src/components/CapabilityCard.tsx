import React from "react";
import { palette } from "../theme";

interface CapabilityCardProps {
  capability: { title: string; description: string; badge?: string };
}

const CapabilityCard: React.FC<CapabilityCardProps> = ({ capability }) => (
  <div
    style={{
      padding: 16,
      margin: "6px 0",
      background: palette.surface,
      borderRadius: 12,
      border: `1px solid ${palette.border}`,
    }}
  >
    {capability.badge ? (
      <div
        style={{
          display: "inline-block",
          background: palette.elevated,
          color: palette.muted,
          padding: "4px 8px",
          borderRadius: 999,
          fontSize: 11,
          marginBottom: 6,
        }}
      >
        {capability.badge}
      </div>
    ) : null}
    <div style={{ color: palette.text, fontSize: 18, fontWeight: "bold" }}>
      {capability.title}
    </div>
    <div style={{ color: palette.muted, marginTop: 4, lineHeight: 1.4 }}>
      {capability.description}
    </div>
  </div>
);

export default CapabilityCard;
