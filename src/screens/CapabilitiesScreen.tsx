import React from "react";
import { View, FlatList, StyleSheet, Text } from "react-native";
import CapabilityCard from "../components/CapabilityCard";
import { palette } from "../theme";

const capabilities = [
  {
    key: "1",
    title: "Inference locale rapide",
    description: "Lance WebLLM sur l'appareil avec détection WebGPU/WebGL et bascule CPU si besoin.",
    badge: "Performance",
  },
  {
    key: "2",
    title: "Vie privée garantie",
    description: "Aucune donnée envoyée au cloud. Tout reste sur mobile, desktop ou TV.",
    badge: "Confidentialité",
  },
  {
    key: "3",
    title: "Multimodal & mains libres",
    description: "Texte, voix, télécommande TV ou CarPlay: l'UI s'adapte à l'entrée.",
    badge: "Accessibilité",
  },
  {
    key: "4",
    title: "Visualisation du raisonnement",
    description: "Affiche les étapes de réflexion pour auditer les réponses complexes.",
    badge: "Transparence",
  },
];

const CapabilitiesScreen: React.FC = () => (
  <View style={styles.container}>
    <Text style={styles.header}>Forces de l'assistant</Text>
    <Text style={styles.subheader}>Optimisé pour mobile, TV, desktop et web avec thèmes sombres modernes.</Text>
    <FlatList
      data={capabilities}
      renderItem={({ item }) => <CapabilityCard capability={item} />}
      keyExtractor={(item) => item.key}
      contentContainerStyle={styles.list}
    />
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background, padding: 12 },
  header: { color: palette.text, fontSize: 22, fontWeight: "800", marginBottom: 4 },
  subheader: { color: palette.muted, marginBottom: 12 },
  list: { paddingBottom: 8 },
});

export default CapabilitiesScreen;
