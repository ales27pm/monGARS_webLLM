import React from "react";
import { View, Text, StyleSheet } from "react-native";
import VoiceInput from "../components/VoiceInput";

const VoiceModeScreen: React.FC = () => (
  <View style={styles.container}>
    <Text style={styles.title}>Voice Mode</Text>
    <VoiceInput
      onSpeak={(text) => {
        console.log("Voice input:", text);
      }}
    />
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 24, marginBottom: 16 },
});

export default VoiceModeScreen;
