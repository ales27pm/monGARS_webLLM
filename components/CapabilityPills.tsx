import React from "react";
import type { Config } from "../types";

const capabilityTone = {
  emerald:
    "bg-emerald-50/70 dark:bg-emerald-900/40 border-emerald-200/70 dark:border-emerald-800 text-emerald-800 dark:text-emerald-100",
  indigo:
    "bg-indigo-50/70 dark:bg-indigo-900/40 border-indigo-200/70 dark:border-indigo-800 text-indigo-800 dark:text-indigo-100",
  cyan:
    "bg-cyan-50/70 dark:bg-cyan-900/40 border-cyan-200/70 dark:border-cyan-800 text-cyan-800 dark:text-cyan-100",
  slate:
    "bg-slate-50/70 dark:bg-slate-900/50 border-slate-200/70 dark:border-slate-800 text-slate-700 dark:text-slate-100",
  amber:
    "bg-amber-50/70 dark:bg-amber-900/40 border-amber-200/70 dark:border-amber-800 text-amber-800 dark:text-amber-100",
  rose:
    "bg-rose-50/70 dark:bg-rose-900/40 border-rose-200/70 dark:border-rose-800 text-rose-800 dark:text-rose-100",
} as const;

export const PRIVACY_CAPABILITY = {
  icon: "fa-shield-halved",
  label: "Confidentialité",
  value: "100% locale",
} as const;

export function CapabilityPills({
  config,
  webGPUAvailable,
}: {
  config: Config;
  webGPUAvailable?: boolean;
}) {
  const gpuReady = webGPUAvailable === undefined ? null : webGPUAvailable;
  const pills = [
    {
      ...PRIVACY_CAPABILITY,
      tone: capabilityTone.emerald,
    },
    {
      icon: "fa-satellite-dish",
      label: "Recherche web",
      value: config.toolSearchEnabled ? "Active" : "Désactivée",
      tone: config.toolSearchEnabled ? capabilityTone.indigo : capabilityTone.slate,
    },
    {
      icon: "fa-brain",
      label: "Mémoire sémantique",
      value: config.semanticMemoryEnabled ? "ON" : "OFF",
      tone: config.semanticMemoryEnabled ? capabilityTone.cyan : capabilityTone.slate,
    },
    {
      icon: "fa-microchip",
      label: "Accélération",
      value:
        gpuReady === null
          ? "Détection en cours"
          : gpuReady
            ? "WebGPU prête"
            : "CPU (fallback)",
      tone:
        gpuReady === null
          ? capabilityTone.slate
          : gpuReady
            ? capabilityTone.amber
            : capabilityTone.rose,
    },
  ];

  return (
    <div className="w-full max-w-4xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      {pills.map((pill) => (
        <div
          key={pill.label}
          className={`rounded-2xl border px-4 py-3 shadow-sm backdrop-blur bg-white/40 dark:bg-slate-900/40 flex items-center gap-3 ${pill.tone}`}
        >
          <span className="shrink-0 rounded-xl bg-white/60 dark:bg-slate-800/60 px-3 py-2 shadow-inner shadow-black/10 text-primary-DEFAULT">
            <i className={`fa-solid ${pill.icon}`} aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300">
              {pill.label}
            </p>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {pill.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
