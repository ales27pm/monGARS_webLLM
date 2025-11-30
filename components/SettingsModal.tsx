import React, { memo, useEffect, useRef, useState } from 'react';
import { ModelConfig } from '../types';
import { MODELS } from '../constants';
import { TurboHaptics } from '../utils';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    webGPUSupported: boolean;
    onModelSelect: (model: ModelConfig) => void;
    currentModel: ModelConfig | null;
    onClearChat: () => void;
    onExportChat: () => void;
}

const SettingsModal: React.FC<Props> = memo(({ 
    isOpen, 
    onClose, 
    webGPUSupported, 
    onModelSelect, 
    currentModel, 
    onClearChat, 
    onExportChat 
}) => {
    const [selectedModelId, setSelectedModelId] = useState<string>(currentModel?.id || MODELS[0].id);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);
    
    useEffect(() => {
        if (currentModel) {
            setSelectedModelId(currentModel.id);
        }
    }, [currentModel]);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    if (!isOpen) return null;
    
    const handleModelLoad = () => {
        const model = MODELS.find(m => m.id === selectedModelId);
        if (model) {
            TurboHaptics.notificationSuccess();
            onModelSelect(model);
        }
        onClose();
    };
    
    const handleClearChat = () => {
        TurboHaptics.impactMedium();
        onClearChat();
        setShowClearConfirm(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" role="dialog">
            <div 
                ref={modalRef}
                className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto"
            >
                <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center sticky top-0 bg-white/95 dark:bg-slate-800/95 backdrop-blur z-10">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Neural Engine Settings</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <i className="fas fa-times text-lg"></i>
                    </button>
                </div>
                
                <div className="p-6 space-y-6">
                    {/* Status Section */}
                    <div className={`p-4 rounded-lg border ${webGPUSupported ? 'bg-emerald-50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-800/30' : 'bg-red-50 border-red-100'}`}>
                        <h3 className={`text-sm font-semibold mb-2 flex items-center gap-2 ${webGPUSupported ? 'text-emerald-800 dark:text-emerald-400' : 'text-red-800'}`}>
                            <i className="fas fa-microchip"></i> WebGPU Status
                        </h3>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                            {webGPUSupported 
                                ? "✅ WebGPU is supported on your device. Local inference enabled."
                                : "❌ WebGPU is not supported. Please use a compatible browser."}
                        </p>
                    </div>
                    
                    {/* Model List */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Available Models</h3>
                        <div className="space-y-3">
                            {MODELS.map((model) => (
                                <div 
                                    key={model.id}
                                    onClick={() => setSelectedModelId(model.id)}
                                    className={`p-4 rounded-lg border cursor-pointer transition-all ${
                                        selectedModelId === model.id
                                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/10 shadow-sm'
                                            : 'border-gray-200 dark:border-slate-700 hover:border-emerald-300'
                                    }`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <h4 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                                {model.name}
                                                {model.badge && (
                                                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] rounded-full uppercase tracking-wider font-bold border border-blue-200 dark:border-blue-800">
                                                        {model.badge}
                                                    </span>
                                                )}
                                                {model.recommended && (
                                                    <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[10px] rounded-full border border-emerald-200 dark:border-emerald-800">
                                                        Recommended
                                                    </span>
                                                )}
                                            </h4>
                                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                <span className="text-[10px] bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded text-gray-500 dark:text-gray-400">{model.size}</span>
                                                <span className="text-[10px] bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded text-gray-500 dark:text-gray-400">{model.params} Params</span>
                                                <span className="text-[10px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded">{model.quantization}</span>
                                            </div>
                                        </div>
                                        <div className={`w-4 h-4 rounded-full border-2 mt-1 ${
                                            selectedModelId === model.id ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 dark:border-slate-600'
                                        }`} />
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{model.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    {/* Actions */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Chat Management</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => { TurboHaptics.impactLight(); onExportChat(); }}
                                className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
                            >
                                <i className="fas fa-download"></i> Export
                            </button>
                            <button
                                onClick={() => setShowClearConfirm(true)}
                                className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                            >
                                <i className="fas fa-trash"></i> Clear
                            </button>
                        </div>
                    </div>

                    {/* Warning Box */}
                    <div className="bg-yellow-50 dark:bg-yellow-900/10 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800/30 text-xs text-gray-600 dark:text-gray-400">
                         <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-400 mb-2 flex items-center gap-2">
                            <i className="fas fa-exclamation-triangle"></i> Important
                        </h3>
                        <ul className="space-y-1 list-disc list-inside">
                            <li>First download takes time (1-5GB).</li>
                            <li>Models are cached for offline use.</li>
                            <li>Chrome or Edge recommended.</li>
                        </ul>
                    </div>
                </div>
                
                {/* Footer Action */}
                <div className="p-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/50 sticky bottom-0">
                    <button 
                        onClick={handleModelLoad}
                        disabled={!webGPUSupported}
                        className={`w-full py-3 rounded-xl font-semibold transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 ${
                            webGPUSupported
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-gray-300 dark:bg-slate-700 text-gray-500 cursor-not-allowed'
                        }`}
                    >
                        <i className="fas fa-download mr-2"></i>
                        {webGPUSupported ? 'Load Selected Model' : 'WebGPU Required'}
                    </button>
                </div>

                {/* Confirm Dialog Overlay */}
                {showClearConfirm && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-4 rounded-xl z-20 backdrop-blur-sm">
                        <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-gray-200 dark:border-slate-700 max-w-sm w-full shadow-2xl animate-fade-in">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Clear History?</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">This cannot be undone.</p>
                            <div className="flex gap-3">
                                <button onClick={handleClearChat} className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Yes, Clear</button>
                                <button onClick={() => setShowClearConfirm(false)} className="flex-1 py-2 bg-gray-200 dark:bg-slate-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300">Cancel</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});

export default SettingsModal;