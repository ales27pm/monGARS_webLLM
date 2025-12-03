import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { palette } from "../theme";

const ReasoningVisualizer: React.FC = () => (
  <View style={styles.container}>
    <Text style={styles.text}>Graphique du flux de pensée</Text>
    <Text style={styles.caption}>Branches parallèles, score de confiance et appels outils</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    width: 320,
    height: 260,
    backgroundColor: palette.elevated,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 12,
  },
  text: { color: palette.text, fontWeight: "700", fontSize: 16 },
  caption: { color: palette.muted, textAlign: "center", marginTop: 6 },
});

export default ReasoningVisualizer;
