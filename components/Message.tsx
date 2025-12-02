
import React, { useEffect, useRef } from 'react';
// FIX: Alias imported `Message` type to avoid name conflict with the `Message` component.
import type { Message as MessageType } from '../types';

declare const marked: any;
declare const DOMPurify: any;
declare const hljs: any;

interface MessageProps {
  message: MessageType;
}

export const Message: React.FC<MessageProps> = ({ message }) => {
  const contentRef = useRef<HTMLDivElement>(null);

  const isUser = message.role === 'user';
  const avatarText = isUser ? 'Moi' : 'MG';

  const renderContent = (content: string) => {
    if (!content && message.role === 'assistant') {
      return '<span class="animate-pulse">...</span>';
    }
    const rawHtml = marked.parse(content);
    return DOMPurify.sanitize(rawHtml);
  };

  useEffect(() => {
    if (contentRef.current && message.role === 'assistant') {
      contentRef.current.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block as HTMLElement);
      });
    }
  }, [message.content, message.role]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message.content);
  };

  return (
    <div className={`flex gap-4 max-w-[85%] ${isUser ? 'ml-auto flex-row-reverse' : ''}`}>
      <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm ${isUser ? 'bg-primary-DEFAULT text-white' : 'bg-primary-light text-primary-dark'}`}>
        {avatarText}
      </div>
      <div className="flex flex-col group">
        <div 
          ref={contentRef}
          className={`bubble text-sm leading-relaxed rounded-2xl p-4 shadow-sm prose prose-sm max-w-none prose-p:my-2 first:prose-p:mt-0 last:prose-p:mb-0 prose-headings:my-2
            ${isUser 
              ? 'bg-primary-DEFAULT text-white rounded-br-lg' 
              : 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-lg'}`
          }
          dangerouslySetInnerHTML={{ __html: renderContent(message.content) }}
        />
        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
           <button onClick={copyToClipboard} title="Copier" className="text-slate-400 hover:text-primary-DEFAULT text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-700">
             <i className="fa-solid fa-copy"></i>
           </button>
        </div>
      </div>
    </div>
  );
};
