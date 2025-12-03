import React, { useState } from "react";
import { View, TextInput, Button, StyleSheet } from "react-native";

interface InputBarProps {
  onSend: (text: string) => void;
}

const InputBar: React.FC<InputBarProps> = ({ onSend }) => {
  const [text, setText] = useState("");

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Ask Mon Gars..."
        placeholderTextColor="#777"
        value={text}
        onChangeText={setText}
        onSubmitEditing={handleSend}
        returnKeyType="send"
      />
      <Button title="Send" onPress={handleSend} color="#1E90FF" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: "row", padding: 8, backgroundColor: "#111" },
  input: {
    flex: 1,
    color: "#fff",
    padding: 8,
    marginRight: 8,
    backgroundColor: "#222",
    borderRadius: 4,
  },
});

export default InputBar;
