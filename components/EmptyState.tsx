import React from 'react';
import type { EngineStatus, InitProgressReport } from '../types';

interface EmptyStateProps {
  status: EngineStatus;
  progress: InitProgressReport;
  onLoad: () => void;
}

const FeatureChip: React.FC<{ icon: string; text: string }> = ({ icon, text }) => (
  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-4 py-2 text-sm flex items-center gap-2">
    <i className={`fa-solid ${icon} text-primary-DEFAULT`}></i>
    <span>{text}</span>
  </div>
);

export const EmptyState: React.FC<EmptyStateProps> = ({ status, progress, onLoad }) => {
  const isLoading = status === 'loading';
  const isError = status === 'error';

  return (
    <div className="text-center mt-[10vh] text-slate-500 dark:text-slate-400 p-4 animate-fade-in">
      <i className="fa-solid fa-microchip text-5xl text-primary-DEFAULT/50 mb-4"></i>
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2">Mon Gars v2.1</h2>
      <p className="mb-6">Assistant IA 100% local · WebGPU · Français natif</p>

      <div className="flex flex-wrap justify-center gap-3 mb-8">
        <FeatureChip icon="fa-shield-alt" text="100% Privé & Local" />
        <FeatureChip icon="fa-bolt" text="Rapide & Léger" />
        <FeatureChip icon="fa-language" text="Réponses en Français" />
      </div>

      {(isLoading || isError) && (
        <div className="w-full max-w-md mx-auto my-6">
          <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-300 ${isError ? 'bg-error' : 'bg-gradient-to-r from-primary-DEFAULT to-secondary'}`}
              style={{ width: isError ? '100%' : `${Math.round(progress.progress * 100)}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-xs">
            <span className={isError ? 'text-error' : ''}>{progress.text}</span>
            {!isError && <span>{Math.round(progress.progress * 100)}%</span>}
          </div>
        </div>
      )}

      {status !== 'loading' && (
        <button
          onClick={onLoad}
          className="mt-6 px-6 py-3 rounded-lg font-semibold text-white bg-primary-DEFAULT hover:bg-primary-hover shadow-lg hover:shadow-primary-DEFAULT/30 transition-all transform hover:-translate-y-0.5 disabled:bg-slate-400 disabled:cursor-not-allowed"
        >
          {isError ? (
            <>
              <i className="fa-solid fa-rotate-right mr-2"></i> Réessayer
            </>
          ) : (
            <>
              <i className="fa-solid fa-power-off mr-2"></i> Démarrer le Moteur
            </>
          )}
        </button>
      )}

      <div className="mt-8 text-xs text-slate-400">
        <p>
          <i className="fa-solid fa-lightbulb"></i> Conseil : Utilise Chrome/Edge avec WebGPU activé
        </p>
      </div>
    </div>
  );
};
