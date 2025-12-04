import React from "react";
import InputBar from "../InputBar";
import { useChatContext } from "../../context/ChatContext";

export interface ChatComposerProps {
  disabled?: boolean;
  disabledReason?: string;
}

const ChatComposer: React.FC<ChatComposerProps> = ({
  disabled = false,
  disabledReason,
}) => {
  const { sendMessage, isGenerating } = useChatContext();

  return (
    <InputBar
      onSend={sendMessage}
      disabled={disabled || isGenerating}
      isLoading={isGenerating}
      helperText={disabled ? disabledReason : undefined}
    />
  );
};

export default ChatComposer;
