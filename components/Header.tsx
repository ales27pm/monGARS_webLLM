import React from 'react';

interface HeaderProps {
  onToggleTheme: () => void;
  onSettings: () => void;
  theme: 'light' | 'dark';
}

export const Header: React.FC<HeaderProps> = ({ onToggleTheme, onSettings, theme }) => {
  return (
    <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-3 flex justify-between items-center h-[60px] flex-shrink-0 z-10">
      <div className="flex items-center gap-2">
        <i className="fa-solid fa-robot text-primary-DEFAULT text-2xl"></i>
        <div className="flex items-baseline">
          <span className="font-bold text-xl text-primary-DEFAULT">Mon Gars</span>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-2 hidden sm:inline">· IA Locale</span>
        </div>
      </div>
      <div className="flex gap-1">
        <IconButton onClick={onToggleTheme} title="Changer le thème">
          <i className={`fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`}></i>
        </IconButton>
        <IconButton onClick={onSettings} title="Paramètres">
          <i className="fa-solid fa-sliders"></i>
        </IconButton>
      </div>
    </header>
  );
};

const IconButton: React.FC<{ onClick: () => void; title: string; children: React.ReactNode }> = ({ onClick, title, children }) => (
  <button onClick={onClick} title={title} className="w-9 h-9 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-primary-DEFAULT rounded-md transition-colors">
    {children}
  </button>
);
