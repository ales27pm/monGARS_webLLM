import React from "react";
import { View, Button, StyleSheet, Platform } from "react-native";

interface VoiceInputProps {
  onSpeak: (text: string) => void;
}

const VoiceInput: React.FC<VoiceInputProps> = ({ onSpeak }) => (
  <View style={styles.container}>
    <Button
      title={Platform.OS === "web" ? "Simulate Voice" : "Start Voice Recognition"}
      onPress={() => onSpeak("Sample voice input text")}
      color="#1E90FF"
    />
  </View>
);

const styles = StyleSheet.create({
  container: { padding: 16 },
});

export default VoiceInput;
