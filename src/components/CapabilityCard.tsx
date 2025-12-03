import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface CapabilityCardProps {
  capability: { title: string; description: string };
}

const CapabilityCard: React.FC<CapabilityCardProps> = ({ capability }) => (
  <View style={styles.card}>
    <Text style={styles.title}>{capability.title}</Text>
    <Text style={styles.desc}>{capability.description}</Text>
  </View>
);

const styles = StyleSheet.create({
  card: { padding: 16, margin: 8, backgroundColor: "#222", borderRadius: 8 },
  title: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  desc: { color: "#ccc", marginTop: 4 },
});

export default CapabilityCard;
