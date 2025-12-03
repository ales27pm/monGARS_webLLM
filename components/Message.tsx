
import React, { useEffect, useRef } from "react";
import type { Message as MessageType } from "../types";

declare const marked: any;
declare const DOMPurify: any;
declare const hljs: any;

interface MessageProps {
  message: MessageType;
}

export const Message: React.FC<MessageProps> = ({ message }) => {
  const contentRef = useRef<HTMLDivElement>(null);

  const isUser = message.role === "user";
  const avatarText = isUser ? "Moi" : "MG";

  const renderContent = (content: string | null | undefined) => {
    const safeContent = typeof content === "string" ? content : "";

    if (!safeContent && message.role === "assistant") {
      return "<span class=\"animate-pulse\">...</span>";
    }
    const rawHtml = marked.parse(safeContent);
    return DOMPurify.sanitize(rawHtml);
  };

  useEffect(() => {
    if (contentRef.current && message.role === "assistant") {
      contentRef.current.querySelectorAll("pre code").forEach((block) => {
        hljs.highlightElement(block as HTMLElement);
      });
    }
  }, [message.content, message.role]);

  const copyToClipboard = () => {
    const textToCopy = typeof message.content === "string" ? message.content : "";
    navigator.clipboard.writeText(textToCopy);
  };

  return (
    <div
      className={`flex gap-4 max-w-[85%] ${isUser ? "ml-auto flex-row-reverse" : ""}`}
    >
      <div
        className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm ${isUser ? "bg-primary-DEFAULT text-white" : "bg-primary-light text-primary-dark"}`}
      >
        {avatarText}
      </div>
      <div className="flex flex-col group">
        <div
          ref={contentRef}
          className={`bubble text-sm leading-relaxed rounded-2xl p-4 shadow-sm prose prose-sm max-w-none prose-p:my-2 first:prose-p:mt-0 last:prose-p:mb-0 prose-headings:my-2 ${
            isUser
              ? "bg-primary-DEFAULT text-white rounded-br-lg"
              : "bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-lg"
          }`}
          dangerouslySetInnerHTML={{
            __html: renderContent(message.content),
          }}
        />
        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.sources.map((source) => (
              <a
                key={`${message.id}-${source.url}`}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-full border border-slate-200 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 hover:border-primary-DEFAULT hover:text-primary-DEFAULT transition-colors"
              >
                <i className="fa-solid fa-link" aria-hidden="true"></i>
                <span className="truncate max-w-[200px]" title={source.title}>
                  {source.title || source.url}
                </span>
              </a>
            ))}
          </div>
        )}
        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
          <button
            onClick={copyToClipboard}
            title="Copier"
            className="text-slate-400 hover:text-primary-DEFAULT text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-700"
          >
            <i className="fa-solid fa-copy"></i>
          </button>
        </div>
      </div>
    </div>
  );
};
