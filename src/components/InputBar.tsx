import React, { useState } from "react";
import { View, TextInput, Button, StyleSheet } from "react-native";
import { palette } from "../theme";

interface InputBarProps {
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
}

const InputBar: React.FC<InputBarProps> = ({ onSend, disabled = false }) => {
  const [text, setText] = useState("");

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    await onSend(trimmed);
    setText("");
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Ask Mon Gars..."
        placeholderTextColor={palette.muted}
        value={text}
        onChangeText={setText}
        onSubmitEditing={handleSend}
        returnKeyType="send"
        editable={!disabled}
      />
      <Button
        title="Envoyer"
        onPress={handleSend}
        color={palette.accent}
        disabled={disabled}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    padding: 10,
    backgroundColor: palette.surface,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  input: {
    flex: 1,
    color: palette.text,
    padding: 12,
    marginRight: 10,
    backgroundColor: palette.elevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
  },
});

export default InputBar;
