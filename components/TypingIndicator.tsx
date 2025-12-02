
import React from 'react';

export const TypingIndicator: React.FC = () => {
  return (
    <div className="flex gap-4 max-w-[85%]">
      <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm bg-primary-light text-primary-dark">
        MG
      </div>
      <div className="bg-white dark:bg-slate-700 rounded-2xl rounded-bl-lg p-4 shadow-sm flex items-center gap-3">
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-primary-DEFAULT animate-bounce" style={{ animationDelay: '0s' }}></span>
          <span className="w-2 h-2 rounded-full bg-primary-DEFAULT animate-bounce" style={{ animationDelay: '0.2s' }}></span>
          <span className="w-2 h-2 rounded-full bg-primary-DEFAULT animate-bounce" style={{ animationDelay: '0.4s' }}></span>
        </div>
        <span className="text-sm text-slate-500 dark:text-slate-400">Mon Gars réfléchit...</span>
      </div>
    </div>
  );
};
