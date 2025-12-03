import React from "react";
import { View, Text, StyleSheet } from "react-native";
import ReasoningVisualizer from "../components/ReasoningVisualizer";

const ReasoningScreen: React.FC = () => (
  <View style={styles.container}>
    <Text style={styles.title}>Reasoning Visualizer</Text>
    <ReasoningVisualizer />
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  title: { color: "#fff", fontSize: 24, marginBottom: 16 },
});

export default ReasoningScreen;
