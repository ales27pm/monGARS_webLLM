import React, { useState, useRef, useEffect } from 'react';
import type { EngineStatus } from '../types';

interface InputBarProps {
  onSend: (text: string) => void;
  onStop: () => void;
  isGenerating: boolean;
  engineStatus: EngineStatus;
}

export const InputBar: React.FC<InputBarProps> = ({ onSend, onStop, isGenerating, engineStatus }) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 150)}px`;
    }
  }, [text]);

  const handleSend = () => {
    if (text.trim()) {
      onSend(text.trim());
      setText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape' && isGenerating) {
        onStop();
    }
  };

  const isEngineReady = engineStatus === 'ready';
  const isDisabled = !isEngineReady || isGenerating;

  return (
    <>
      <div className="relative flex items-end gap-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-3xl p-2 shadow-sm focus-within:border-primary-DEFAULT focus-within:ring-2 focus-within:ring-primary-light/50 transition-all">
        {isGenerating && (
          <button onClick={onStop} title="Arrêter la génération (Esc)" className="w-10 h-10 flex-shrink-0 flex items-center justify-center text-error hover:bg-error/10 rounded-full transition-colors">
            <i className="fa-solid fa-stop"></i>
          </button>
        )}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={isEngineReady ? "Pose ta question..." : "Veuillez démarrer le moteur..."}
          disabled={!isEngineReady}
          className="flex-1 bg-transparent border-none outline-none text-sm resize-none p-2 placeholder-slate-400 dark:placeholder-slate-500 disabled:cursor-not-allowed"
        />
        <button onClick={handleSend} disabled={isDisabled || !text.trim()} title="Envoyer (Entrée)" className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-primary-DEFAULT text-white rounded-full hover:bg-primary-hover disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors">
          <i className="fa-solid fa-paper-plane"></i>
        </button>
      </div>
      <div className="mt-2 text-center text-xs text-slate-400 dark:text-slate-500">
        <span>Appuie sur <kbd className="font-sans bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">Entrée</kbd> pour envoyer · <kbd className="font-sans bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">Esc</kbd> pour arrêter</span>
      </div>
    </>
  );
};
