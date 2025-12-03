import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface SettingsItemProps {
  option: { label: string; key: string };
}

const SettingsItem: React.FC<SettingsItemProps> = ({ option }) => (
  <View style={styles.item}>
    <Text style={styles.text}>{option.label}</Text>
  </View>
);

const styles = StyleSheet.create({
  item: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    backgroundColor: "#111",
  },
  text: { color: "#fff", fontSize: 18 },
});

export default SettingsItem;
