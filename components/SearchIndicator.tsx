

import React from 'react';

interface SearchIndicatorProps {
  // FIX: Allow query to be null, and handle it inside the component
  query: string | null;
}

export const SearchIndicator: React.FC<SearchIndicatorProps> = ({ query }) => {
  if (!query) return null; // FIX: Don't render if query is null

  return (
    <div className="flex gap-4 max-w-[85%] animate-fade-in">
      <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300">
        <i className="fa-solid fa-globe"></i>
      </div>
      <div className="bg-white dark:bg-slate-700 rounded-2xl rounded-bl-lg p-4 shadow-sm flex items-center gap-3">
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" style={{ animationDelay: '0s' }}></span>
          <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" style={{ animationDelay: '0.2s' }}></span>
          <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" style={{ animationDelay: '0.4s' }}></span>
        </div>
        <span className="text-sm text-slate-500 dark:text-slate-400">Recherche sur le web : "{query}"...</span>
      </div>
    </div>
  );
};
