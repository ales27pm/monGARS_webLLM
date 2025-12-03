import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { palette } from "../theme";

interface ChatBubbleProps {
  message: { role: string; content: string };
}

const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
  const isUser = message.role === "user";
  return (
    <View
      style={[
        styles.bubble,
        {
          alignSelf: isUser ? "flex-end" : "flex-start",
          backgroundColor: isUser ? palette.accent : palette.elevated,
        },
      ]}
    >
      <Text style={[styles.text, { color: isUser ? "#0b0d12" : palette.text }]}>{message.content}</Text>
      <Text style={styles.meta}>{isUser ? "Toi" : "Assistant"}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  bubble: {
    margin: 6,
    padding: 12,
    borderRadius: 12,
    maxWidth: "85%",
    borderWidth: 1,
    borderColor: palette.border,
  },
  text: { fontSize: 16, lineHeight: 22 },
  meta: { marginTop: 6, color: palette.muted, fontSize: 12 },
});

export default ChatBubble;
