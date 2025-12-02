import React from "react";
import type { Config, EngineStatus, InitProgressReport } from "../types";
import { PRIVACY_CAPABILITY } from "./CapabilityPills";

const quickStatusStyles: Record<
  EngineStatus,
  { color: string; icon: string; label: string }
> = {
  ready: {
    color: "bg-emerald-400/20 text-emerald-100 border-emerald-300/40",
    icon: "fa-check",
    label: "Prêt",
  },
  loading: {
    color: "bg-amber-400/15 text-amber-100 border-amber-300/30",
    icon: "fa-circle-notch animate-spin",
    label: "Initialisation",
  },
  idle: {
    color: "bg-rose-400/15 text-rose-100 border-rose-300/30",
    icon: "fa-pause",
    label: "En attente",
  },
  error: {
    color: "bg-rose-400/15 text-rose-100 border-rose-300/30",
    icon: "fa-pause",
    label: "Erreur",
  },
};

export function HeroHeader({
  engineStatus,
  initProgress,
  config,
}: {
  engineStatus: EngineStatus;
  initProgress: InitProgressReport;
  config: Config;
}) {
  const { color: quickStatusColor, icon: quickStatusIcon, label: quickStatusLabel } =
    quickStatusStyles[engineStatus] ?? quickStatusStyles.idle;
  const heroStatusText =
    engineStatus === "loading" ? initProgress.text : quickStatusLabel;

  return (
    <div className="w-full max-w-4xl mb-4">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-primary-DEFAULT via-indigo-600 to-slate-900 text-white p-5 shadow-xl shadow-primary-DEFAULT/25">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-white/10 to-transparent blur-2xl" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between relative z-[1]">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-white/70">Mon Gars v2.1</p>
            <h1 className="text-2xl sm:text-3xl font-bold">
              Assistant IA local, prêt à répondre.
            </h1>
            <p className="text-sm text-white/70 max-w-2xl">
              Français natif, 100% privé grâce à WebGPU. Pose une question, dicte ta voix ou laisse l'IA chercher sur le web si nécessaire.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 min-w-[220px]">
            <div
              className={`rounded-2xl border ${quickStatusColor} px-4 py-3 text-xs shadow-inner shadow-black/10 flex items-center gap-2`}
            >
              <i className={`fa-solid ${quickStatusIcon}`} aria-hidden="true" />
              <div className="leading-tight">
                <p className="uppercase tracking-wide text-[10px] text-white/70">
                  Statut moteur
                </p>
                <p className="font-semibold text-white">{heroStatusText}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-xs shadow-inner shadow-black/10 flex items-center gap-2">
              <i className={`fa-solid ${PRIVACY_CAPABILITY.icon}`} aria-hidden="true" />
              <div className="leading-tight">
                <p className="uppercase tracking-wide text-[10px] text-white/70">
                  {PRIVACY_CAPABILITY.label}
                </p>
                <p className="font-semibold text-white">{PRIVACY_CAPABILITY.value}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-xs flex items-center gap-2 shadow-inner shadow-black/10">
              <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" />
              <div className="leading-tight">
                <p className="uppercase tracking-wide text-[10px] text-white/70">
                  Mémoire sémantique
                </p>
                <p className="font-semibold text-white">
                  {config.semanticMemoryEnabled ? "Activée" : "Désactivée"}
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/5 px-4 py-3 text-xs flex items-center gap-2 shadow-inner shadow-black/10">
              <i className="fa-solid fa-language" aria-hidden="true" />
              <div className="leading-tight">
                <p className="uppercase tracking-wide text-[10px] text-white/70">Langue</p>
                <p className="font-semibold text-white">Français natif</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
