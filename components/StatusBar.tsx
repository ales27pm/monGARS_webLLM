import React from 'react';
import type { EngineStatus, InitProgressReport } from '../types';

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

export const StatusBar: React.FC<StatusBarProps> = ({ status, progress, performanceStats, onReload }) => {
  const isError = status === 'error';
  
  const statusText = () => {
    switch (status) {
      case 'idle': return 'En attente...';
      case 'loading': return progress.text;
      case 'ready': return 'Prêt';
      case 'error': return progress.text;
      default: return '';
    }
  };

  const statusColor = () => {
    switch (status) {
      case 'idle': return 'bg-slate-400';
      case 'loading': return 'bg-amber-500 animate-pulse';
      case 'ready': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-slate-400';
    }
  };
  
  return (
    <div className="bg-slate-50/80 dark:bg-slate-900/80 px-4 py-2 flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${statusColor()}`}></span>
        <span>{statusText()}</span>
        {isError && (
          <button onClick={onReload} className="ml-2 text-primary-DEFAULT hover:underline">
            Réessayer
          </button>
        )}
      </div>
      <div className="hidden sm:flex items-center gap-4 text-slate-400 dark:text-slate-500">
        <div className="flex items-center gap-1.5" title="Tokens par seconde">
          <i className="fa-solid fa-gauge-high"></i>
          <span>{performanceStats.tps} T/s</span>
        </div>
        <div className="flex items-center gap-1.5" title="Utilisation mémoire estimée">
          <i className="fa-solid fa-memory"></i>
          <span>{performanceStats.memory} MB</span>
        </div>
        <div className="flex items-center gap-1.5" title="Tokens dans le contexte">
          <i className="fa-solid fa-database"></i>
          <span>{performanceStats.contextTokens}</span>
        </div>
      </div>
    </div>
  );
};
