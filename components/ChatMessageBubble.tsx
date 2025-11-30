import React, { memo, useState, useCallback } from 'react';
import { Message, Role } from '../types';
import { TurboHaptics } from '../utils';

interface Props {
    message: Message;
    onRetry?: (message: Message) => void;
}

const ChatMessageBubble: React.FC<Props> = memo(({ message, onRetry }) => {
    const isUser = message.role === Role.USER;
    const isError = message.isError;
    const [copied, setCopied] = useState(false);
    
    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(message.text);
            setCopied(true);
            TurboHaptics.impactLight();
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    }, [message.text]);
    
    const handleRetry = useCallback(() => {
        TurboHaptics.impactMedium();
        onRetry?.(message);
    }, [message, onRetry]);

    // Simple markdown parser
    const formatText = (text: string) => {
        return text
            .replace(/\n/g, '<br/>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code class="bg-gray-100 dark:bg-slate-700 px-1 rounded text-sm font-mono">$1</code>');
    };
    
    return (
        <div className={`flex w-full mb-4 animate-fade-in ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex max-w-[90%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-end gap-3`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm ${
                    isUser ? 'bg-indigo-600 text-white' : isError ? 'bg-red-500 text-white' : 'bg-emerald-600 text-white'
                }`}>
                    {isUser ? <i className="fas fa-user text-xs"></i> : 
                     isError ? <i className="fas fa-exclamation text-xs"></i> : 
                     <i className="fas fa-robot text-xs"></i>}
                </div>
                <div className={`relative px-4 py-3 rounded-2xl max-w-full shadow-sm ${
                    isUser 
                        ? 'bg-indigo-600 text-white rounded-br-none' 
                        : isError
                            ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 rounded-bl-none'
                            : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-gray-100 rounded-bl-none'
                }`}>
                    <div 
                        className="break-words overflow-hidden text-sm md:text-base leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: formatText(message.text) }} 
                    />
                    <div className="flex justify-between items-center mt-2">
                        <span className={`text-[10px] ${isUser ? 'text-indigo-200' : 'text-gray-400 dark:text-gray-500'}`}>
                            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <div className="flex gap-2 ml-3">
                            {!isUser && (
                                <button
                                    onClick={handleCopy}
                                    className={`text-xs hover:scale-110 transition-transform ${isUser ? 'text-indigo-200 hover:text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                                    title="Copy message"
                                >
                                    {copied ? <i className="fas fa-check"></i> : <i className="fas fa-copy"></i>}
                                </button>
                            )}
                            {isError && onRetry && (
                                <button
                                    onClick={handleRetry}
                                    className="text-xs text-red-400 hover:text-red-600 transition-colors"
                                    title="Retry message"
                                >
                                    <i className="fas fa-redo"></i>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default ChatMessageBubble;