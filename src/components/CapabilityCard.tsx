import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { palette } from "../theme";

interface CapabilityCardProps {
  capability: { title: string; description: string; badge?: string };
}

const CapabilityCard: React.FC<CapabilityCardProps> = ({ capability }) => (
  <View style={styles.card}>
    {capability.badge ? <Text style={styles.badge}>{capability.badge}</Text> : null}
    <Text style={styles.title}>{capability.title}</Text>
    <Text style={styles.desc}>{capability.description}</Text>
  </View>
);

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginVertical: 6,
    backgroundColor: palette.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: palette.elevated,
    color: palette.muted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 11,
    marginBottom: 6,
  },
  title: { color: palette.text, fontSize: 18, fontWeight: "bold" },
  desc: { color: palette.muted, marginTop: 4, lineHeight: 20 },
});

export default CapabilityCard;
