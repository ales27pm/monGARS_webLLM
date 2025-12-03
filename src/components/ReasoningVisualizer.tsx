import React from "react";
import { View, Text, StyleSheet } from "react-native";

const ReasoningVisualizer: React.FC = () => (
  <View style={styles.container}>
    <Text style={styles.text}>Model reasoning trace will appear here.</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    width: 300,
    height: 300,
    backgroundColor: "#222",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  text: { color: "#fff", textAlign: "center" },
});

export default ReasoningVisualizer;
