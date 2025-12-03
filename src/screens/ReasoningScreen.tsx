import React from "react";
import { View, Text, StyleSheet } from "react-native";
import ReasoningVisualizer from "../components/ReasoningVisualizer";
import { palette } from "../theme";

const reasoningSteps = [
  "Reformulation de la question utilisateur",
  "Recherche d'indices dans la mémoire sémantique",
  "Planification des appels outils (web / voix)",
  "Synthèse et validation de la réponse",
];

const ReasoningScreen: React.FC = () => (
  <View style={styles.container}>
    <Text style={styles.title}>Visualisation du raisonnement</Text>
    <Text style={styles.subtitle}>
      Suis le flux de pensée de l'agent, utile pour déboguer ou expliquer les décisions.
    </Text>
    <ReasoningVisualizer />
    <View style={styles.list}> 
      {reasoningSteps.map((step, index) => (
        <View key={step} style={styles.stepRow}>
          <View style={styles.bullet} />
          <Text style={styles.stepText}>{index + 1}. {step}</Text>
        </View>
      ))}
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  title: { color: palette.text, fontSize: 24, fontWeight: "800" },
  subtitle: { color: palette.muted, textAlign: "center", paddingHorizontal: 12 },
  list: {
    marginTop: 8,
    alignSelf: "stretch",
    backgroundColor: palette.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 12,
  },
  stepRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  bullet: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.accent },
  stepText: { color: palette.text, flexShrink: 1 },
});

export default ReasoningScreen;
