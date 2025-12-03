import React from "react";
import { View, FlatList, StyleSheet } from "react-native";
import CapabilityCard from "../components/CapabilityCard";

const capabilities = [
  { key: "1", title: "Fast Offline Inference", description: "Uses on-device LLM for quick replies." },
  { key: "2", title: "Privacy First", description: "All data is processed on-device; no external servers." },
  { key: "3", title: "Multimodal", description: "Supports text and voice interactions." },
];

const CapabilitiesScreen: React.FC = () => (
  <View style={styles.container}>
    <FlatList
      data={capabilities}
      renderItem={({ item }) => <CapabilityCard capability={item} />}
      keyExtractor={(item) => item.key}
    />
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
});

export default CapabilitiesScreen;
