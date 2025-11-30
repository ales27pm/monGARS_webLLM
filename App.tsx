import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Role, Message, ModelConfig, InitProgressReport, ToastNotification } from './types';
import { MODELS, StorageKeys } from './constants';
import { Storage, TurboHaptics, PerformanceMonitor } from './utils';
import { llmService } from './services/llm';
import Toast from './components/Toast';
import ChatMessageBubble from './components/ChatMessageBubble';
import SettingsModal from './components/SettingsModal';
import ErrorBoundary from './components/ErrorBoundary';

const App: React.FC = () => {
    // State
    const [messages, setMessages] = useState<Message[]>(() => {
        const saved = Storage.get<Message[]>(StorageKeys.CHAT_HISTORY, []);
        return saved.length > 0 ? saved : [{
            id: 'welcome',
            role: Role.MODEL,
            text: "Bonjour! I'm **Mon Gars**, your AI assistant running **completely offline** in your browser. \n\n Toggle the shield below to start using on-device AI.",
            timestamp: new Date(),
        }];
    });
    
    const [isLoading, setIsLoading] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isPrivateMode, setIsPrivateMode] = useState(true);
    const [webGPUSupported, setWebGPUSupported] = useState(false);
    const [modelReady, setModelReady] = useState(false);
    const [progress, setProgress] = useState<InitProgressReport>({ text: '', progress: 0 });
    const [selectedModel, setSelectedModel] = useState<ModelConfig | null>(() => Storage.get(StorageKeys.SELECTED_MODEL, null));
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [toasts, setToasts] = useState<ToastNotification[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Persistence
    useEffect(() => {
        Storage.set(StorageKeys.CHAT_HISTORY, messages);
    }, [messages]);

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages, isGenerating]);

    // Toast Manager
    const addToast = useCallback((message: string, type: ToastNotification['type'] = 'info') => {
        const id = Date.now().toString();
        setToasts(prev => [...prev, { id, message, type, duration: 5000 }]);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // Initial Checks
    useEffect(() => {
        const init = async () => {
            const hasGPU = await llmService.checkWebGPUSupport();
            setWebGPUSupported(hasGPU);
            
            if (!hasGPU) {
                addToast('WebGPU not supported on this device', 'warning');
            } else {
                try {
                    await llmService.loadLibrary();
                    // Don't show toast for silent library load
                    
                    // Auto-load previous model if exists
                    if (selectedModel && !modelReady) {
                        initializeModel(selectedModel);
                    }
                } catch (e) {
                    console.error(e);
                    addToast('Failed to load AI Engine', 'error');
                }
            }
        };
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const initializeModel = useCallback(async (modelInfo: ModelConfig) => {
        if (!webGPUSupported) return;
        
        setIsLoading(true);
        setError(null);
        abortControllerRef.current = new AbortController();

        try {
            await llmService.initializeEngine(
                modelInfo, 
                (report) => setProgress(report),
                abortControllerRef.current.signal
            );
            
            setModelReady(true);
            setSelectedModel(modelInfo);
            Storage.set(StorageKeys.SELECTED_MODEL, modelInfo);
            addToast(`${modelInfo.name} loaded!`, 'success');
        } catch (e: any) {
            if (e.name !== 'AbortError') {
                const msg = e.message || 'Unknown error occurred';
                setError(msg);
                addToast(`Error: ${msg}`, 'error');
            }
            setModelReady(false);
        } finally {
            setIsLoading(false);
            setProgress({ text: '', progress: 0 });
        }
    }, [webGPUSupported, addToast]);

    const handleStopGeneration = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            setIsGenerating(false);
            addToast('Generation stopped', 'info');
            TurboHaptics.impactMedium();
        }
    }, [addToast]);

    const handleSendMessage = useCallback(async (text: string) => {
        if (!text.trim()) return;

        const userMsg: Message = {
            id: `user-${Date.now()}`,
            role: Role.USER,
            text: text.trim(),
            timestamp: new Date()
        };
        setMessages(prev => [...prev, userMsg]);
        setIsGenerating(true);
        abortControllerRef.current = new AbortController();

        try {
            PerformanceMonitor.start();
            let responseText = "";

            if (isPrivateMode && modelReady) {
                // Prepare context window - last 10 messages max to save context window
                const contextMessages = messages.slice(-10).map(m => ({
                    role: m.role === Role.USER ? 'user' : 'assistant',
                    content: m.text
                }));
                
                contextMessages.push({ role: 'user', content: userMsg.text });
                
                // Add system prompt at start
                contextMessages.unshift({
                    role: 'system',
                    content: "You are Mon Gars, a helpful offline AI assistant. Be concise and accurate."
                });

                responseText = await llmService.generateCompletion(
                    contextMessages,
                    abortControllerRef.current.signal
                );
            } else {
                responseText = isPrivateMode 
                    ? "Please load a model from settings first." 
                    : "Cloud mode is currently disabled in this demo.";
            }

            const botMsg: Message = {
                id: `bot-${Date.now()}`,
                role: Role.MODEL,
                text: responseText,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, botMsg]);
            TurboHaptics.notificationSuccess();
            
        } catch (e: any) {
            if (e.name === 'AbortError') {
                // Handled by stop generation toast
            } else {
                setMessages(prev => [...prev, {
                    id: `err-${Date.now()}`,
                    role: Role.MODEL,
                    text: `Error: ${e.message}`,
                    timestamp: new Date(),
                    isError: true
                }]);
                TurboHaptics.notificationError();
            }
        } finally {
            setIsGenerating(false);
            PerformanceMonitor.end('Generation');
        }
    }, [messages, isPrivateMode, modelReady, addToast]);

    return (
        <ErrorBoundary>
            <div className={`flex flex-col h-screen safe-area-bottom transition-colors duration-500 ${isPrivateMode ? 'bg-emerald-50/30 dark:bg-emerald-950/20' : 'bg-gray-50 dark:bg-slate-950'}`}>
                
                {/* Toasts */}
                {toasts.map(t => (
                    <Toast key={t.id} toast={t} onClose={() => removeToast(t.id)} />
                ))}

                <SettingsModal 
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                    webGPUSupported={webGPUSupported}
                    onModelSelect={initializeModel}
                    currentModel={selectedModel}
                    onClearChat={() => setMessages([])}
                    onExportChat={() => {
                        const blob = new Blob([JSON.stringify(messages, null, 2)], {type: 'application/json'});
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'chat-history.json';
                        a.click();
                    }}
                />

                {/* Header */}
                <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 glass-effect border-b border-gray-200 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all ${
                            isPrivateMode 
                                ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20 animate-pulse-glow' 
                                : 'bg-gradient-to-br from-indigo-500 to-purple-600'
                        }`}>
                            <i className={`fas ${isPrivateMode ? 'fa-shield-check' : 'fa-robot'} text-white`}></i>
                        </div>
                        <div>
                            <h1 className="font-bold text-lg text-gray-900 dark:text-white">Mon Gars</h1>
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                                {isPrivateMode && modelReady ? selectedModel?.name : 'Offline AI'}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                         <span className={`hidden sm:flex px-3 py-1 text-xs font-semibold rounded-full border items-center gap-1 ${
                            isPrivateMode 
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                : 'bg-indigo-50 text-indigo-600 border-indigo-200'
                        }`}>
                            <i className={`fas ${isPrivateMode ? 'fa-microchip' : 'fa-cloud'}`}></i>
                            {isPrivateMode ? 'On-Device' : 'Cloud'}
                        </span>
                        <button onClick={() => setIsSettingsOpen(true)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
                            <i className="fas fa-sliders-h text-gray-600 dark:text-gray-300"></i>
                        </button>
                    </div>
                </header>

                {/* Progress Bar */}
                {(isLoading || progress.progress > 0) && (
                    <div className="px-6 py-3 bg-emerald-50 dark:bg-emerald-900/10 border-b border-emerald-100">
                        <div className="flex justify-between text-xs mb-1 text-emerald-700 dark:text-emerald-300">
                            <span>{progress.text}</span>
                            <span>{progress.progress}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 transition-all duration-300 relative" style={{width: `${progress.progress}%`}}>
                                <div className="absolute inset-0 bg-white/30 animate-shimmer"></div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Chat Area */}
                <main className="flex-1 overflow-y-auto p-4 md:p-6">
                    <div className="max-w-4xl mx-auto flex flex-col justify-end min-h-full pb-4">
                        {messages.map(msg => (
                            <ChatMessageBubble 
                                key={msg.id} 
                                message={msg} 
                                onRetry={(m) => {
                                    setMessages(prev => prev.filter(x => x.id !== m.id));
                                    handleSendMessage(m.text);
                                }}
                            />
                        ))}
                        
                        {isGenerating && (
                            <div className="flex w-full mb-4 justify-start">
                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center">
                                        <i className="fas fa-robot text-white text-xs"></i>
                                    </div>
                                    <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-none border border-gray-100 dark:border-slate-700 shadow-sm flex items-center gap-2">
                                        <div className="spinner"></div>
                                        <span className="text-gray-400 text-sm">Thinking...</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </main>

                {/* Input Area */}
                <div className="border-t border-gray-200 dark:border-slate-800 glass-effect p-4 sticky bottom-0 z-20 safe-area-bottom">
                    <div className="max-w-4xl mx-auto">
                        <form 
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (inputRef.current) {
                                    handleSendMessage(inputRef.current.value);
                                    inputRef.current.value = '';
                                }
                            }}
                            className="flex gap-2"
                        >
                            <button
                                type="button"
                                onClick={() => {
                                    setIsPrivateMode(!isPrivateMode);
                                    TurboHaptics.impactLight();
                                }}
                                className={`p-3 rounded-full transition-all ${
                                    isPrivateMode 
                                        ? 'bg-emerald-100 text-emerald-600 ring-2 ring-emerald-500/20' 
                                        : 'text-gray-400 hover:text-emerald-600 bg-gray-100'
                                }`}
                                disabled={isLoading}
                            >
                                <i className={`fas ${isPrivateMode ? 'fa-shield-check' : 'fa-shield'}`}></i>
                            </button>
                            
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder={isPrivateMode && !modelReady ? "Load a model to start..." : "Message assistant..."}
                                className="flex-1 bg-gray-100 dark:bg-slate-800 rounded-2xl px-4 border-transparent focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 transition-all outline-none"
                                disabled={isLoading || (isPrivateMode && !modelReady) || isGenerating}
                            />
                            
                            <button
                                type={isGenerating ? "button" : "submit"}
                                onClick={isGenerating ? handleStopGeneration : undefined}
                                disabled={isLoading || (isPrivateMode && !modelReady)}
                                className={`p-3 rounded-full shadow-lg transform transition-all ${
                                    isLoading || (isPrivateMode && !modelReady)
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : isGenerating 
                                            ? 'bg-red-500 hover:bg-red-600 text-white hover:scale-105'
                                            : 'bg-emerald-600 hover:bg-emerald-700 text-white hover:-translate-y-0.5'
                                }`}
                            >
                                {isGenerating ? <i className="fas fa-stop"></i> : <i className="fas fa-paper-plane"></i>}
                            </button>
                        </form>
                    </div>
                </div>

            </div>
        </ErrorBoundary>
    );
};

export default App;