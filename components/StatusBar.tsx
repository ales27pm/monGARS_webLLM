import React from "react";
import type { EngineStatus, InitProgressReport } from "../types";

interface StatusBarProps {
  status: EngineStatus;
  progress: InitProgressReport;
  performanceStats: {
    tps: string;
    memory: string;
    contextTokens: number;
  };
  onReload: () => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  status,
  progress,
  performanceStats,
  onReload,
}) => {
  const isError = status === "error";

  const statusText = () => {
    switch (status) {
      case "idle":
        return "En attente...";
      case "loading":
        return progress.text;
      case "ready":
        return "Prêt";
      case "error":
        return progress.text;
      default:
        return "";
    }
  };

  const statusBadge = () => {
    switch (status) {
      case "ready":
        return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/40";
      case "loading":
        return "bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/40";
      case "error":
        return "bg-rose-500/15 text-rose-800 dark:text-rose-200 border-rose-500/40";
      default:
        return "bg-slate-500/15 text-slate-700 dark:text-slate-200 border-slate-500/40";
    }
  };

  return (
    <div className="bg-gradient-to-r from-slate-50/80 via-white/80 to-slate-50/80 dark:from-slate-900/70 dark:via-slate-900/60 dark:to-slate-900/70 px-5 py-3 flex flex-wrap items-center gap-3 justify-between text-xs text-slate-600 dark:text-slate-400 flex-shrink-0 border-b border-slate-100/80 dark:border-slate-800/80">
      <div className="flex items-center gap-2">
        <span
          className={`px-3 py-1 rounded-full border ${statusBadge()} flex items-center gap-2 font-semibold`}
        >
          <span
            className="inline-flex h-2 w-2 rounded-full bg-current"
            aria-hidden="true"
          />
          {statusText()}
        </span>
        {isError && (
          <button
            onClick={onReload}
            className="text-primary-DEFAULT hover:underline font-semibold"
          >
            Réessayer
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-slate-500 dark:text-slate-300">
        <MetricPill
          icon="fa-gauge-high"
          label="Débit"
          value={`${performanceStats.tps} T/s`}
        />
        <MetricPill
          icon="fa-memory"
          label="Mémoire"
          value={`${performanceStats.memory} MB`}
        />
        <MetricPill
          icon="fa-database"
          label="Contexte"
          value={`${performanceStats.contextTokens}`}
        />
      </div>
    </div>
  );
};

const MetricPill: React.FC<{ icon: string; label: string; value: string }> = ({
  icon,
  label,
  value,
}) => {
  const classes =
    "flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200/80 dark:border-slate-700/70 bg-white/70 dark:bg-slate-800/50 shadow-sm";

  return (
    <div className={classes}>
      <span className="text-primary-DEFAULT">
        <i className={`fa-solid ${icon}`} aria-hidden="true"></i>
      </span>
      <div className="flex items-baseline gap-1">
        <span className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {label}
        </span>
        <span className="font-semibold text-slate-700 dark:text-slate-100">
          {value}
        </span>
      </div>
    </div>
  );
};
