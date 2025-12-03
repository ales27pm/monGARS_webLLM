import React from "react";
import { View, Text, StyleSheet } from "react-native";

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
          backgroundColor: isUser ? "#2d2d2d" : "#1a1a1a",
        },
      ]}
    >
      <Text style={styles.text}>{message.content}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  bubble: { margin: 6, padding: 10, borderRadius: 8, maxWidth: "80%" },
  text: { color: "#fff", fontSize: 16 },
});

export default ChatBubble;
