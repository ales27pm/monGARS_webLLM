

import React, { useState, useEffect } from 'react';
import type { Config } from '../types';

interface SettingsModalProps {
  isVisible: boolean;
  onClose: () => void;
  // FIX: Updated onSave prop type to accept the full Config, including modelId
  onSave: (config: Config) => void;
  currentConfig: Config;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isVisible, onClose, onSave, currentConfig }) => {
  const [config, setConfig] = useState(currentConfig);

  useEffect(() => {
    setConfig(currentConfig);
  }, [currentConfig, isVisible]);
  
  if (!isVisible) return null;

  const handleSave = () => {
    onSave(config);
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConfig(prev => ({...prev, [name]: name === 'temperature' || name === 'maxTokens' ? Number(value) : value }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg w-full max-w-lg p-6 animate-modal-slide" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Paramètres du système</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full">
            <i className="fa-solid fa-times"></i>
          </button>
        </div>

        <div className="space-y-6">
          <div className="setting-group">
            <label className="setting-label">Modèle IA</label>
            <div className="setting-input bg-slate-100 dark:bg-slate-700/50">
              Qwen2.5 0.5B (Léger &amp; Rapide)
            </div>
             <p className="text-xs text-slate-500 mt-1"><i className="fa-solid fa-info-circle mr-1"></i>Le modèle est défini pour être léger et efficace.</p>
          </div>
          
          <div className="setting-group">
            <label htmlFor="systemPrompt" className="setting-label">Prompt Système</label>
            <textarea id="systemPrompt" name="systemPrompt" value={config.systemPrompt} onChange={handleInputChange} rows={4} className="setting-input resize-y" />
          </div>

          <div className="setting-group">
            <label htmlFor="temperature" className="flex justify-between items-center">
              <span className="setting-label">Température (Créativité)</span>
              <span className="setting-value">{config.temperature.toFixed(1)}</span>
            </label>
            <input type="range" id="temperature" name="temperature" min="0.1" max="1.0" step="0.1" value={config.temperature} onChange={handleInputChange} className="w-full" />
          </div>

          <div className="setting-group">
            <label htmlFor="maxTokens" className="flex justify-between items-center">
              <span className="setting-label">Tokens maximum</span>
              <span className="setting-value">{config.maxTokens}</span>
            </label>
            <input type="range" id="maxTokens" name="maxTokens" min="128" max="2048" step="128" value={config.maxTokens} onChange={handleInputChange} className="w-full" />
          </div>
        </div>
        
        <div className="flex justify-end gap-3 mt-8">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-700">Annuler</button>
          <button onClick={handleSave} className="px-4 py-2 rounded-md text-sm font-medium bg-primary-DEFAULT text-white hover:bg-primary-hover">
            <i className="fa-solid fa-save mr-2"></i>Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
};
