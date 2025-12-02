

import React, { useEffect, useRef } from 'react';
import { Message as MessageType } from '../types';
import { Message } from './Message';
import { TypingIndicator } from './TypingIndicator';
// Removed SearchIndicator import as it's handled in App.tsx
// import { SearchIndicator } from './SearchIndicator';

interface ChatContainerProps {
  messages: MessageType[];
  isGenerating: boolean;
  searchQuery: string | null;
}

export const ChatContainer: React.FC<ChatContainerProps> = ({ messages, isGenerating, searchQuery }) => {
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating, searchQuery]);

  return (
    <div className="h-full flex flex-col gap-5">
      {messages.map((msg) => (
        <Message key={msg.id} message={msg} />
      ))}
      {/* SearchIndicator is now handled in App.tsx to avoid redundancy */}
      {/* {searchQuery && <SearchIndicator query={searchQuery} />} */}
      {isGenerating && !searchQuery && messages[messages.length-1]?.role !== 'assistant' && <TypingIndicator />}
      <div ref={endOfMessagesRef} />
    </div>
  );
};
