import React from "react";
import { palette } from "../theme";

export type StatusTone = "info" | "warning" | "error" | "success";

export interface StatusBannerProps {
  title: string;
  description?: string;
  tone?: StatusTone;
  progress?: number;
  actionLabel?: string;
  onAction?: () => void;
}

const toneMap: Record<StatusTone, string> = {
  info: palette.accent,
  warning: "#f6c344",
  error: palette.error,
  success: palette.success ?? palette.accent,
};

const StatusBanner: React.FC<StatusBannerProps> = ({
  title,
  description,
  tone = "info",
  progress,
  actionLabel,
  onAction,
}) => {
  const showProgress = typeof progress === "number" && progress >= 0;
  const progressValue = Math.min(100, Math.max(0, progress ?? 0));
  const toneColor = toneMap[tone];

  return (
    <div
      style={{
        border: `1px solid ${toneColor}`,
        background: palette.elevated,
        color: palette.text,
        borderRadius: 10,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
      role="status"
      aria-live="polite"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: toneColor,
            boxShadow: `0 0 0 4px ${toneColor}22`,
          }}
        />
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
      </div>
      {description ? (
        <div style={{ color: palette.muted, fontSize: 13 }}>{description}</div>
      ) : null}
      {showProgress ? (
        <div
          role="progressbar"
          aria-valuenow={progressValue}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progression du chargement"
          style={{
            width: "100%",
            height: 6,
            background: `${palette.border}55`,
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progressValue}%`,
              height: "100%",
              background: toneColor,
              transition: "width 180ms ease",
            }}
          />
        </div>
      ) : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          style={{
            alignSelf: "flex-start",
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${palette.border}`,
            background: "transparent",
            color: palette.text,
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
};

export default StatusBanner;
