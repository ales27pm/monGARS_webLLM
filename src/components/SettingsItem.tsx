import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { palette } from "../theme";

interface SettingsItemProps {
  option: { label: string; key: string };
  children?: React.ReactNode;
}

const SettingsItem: React.FC<SettingsItemProps> = ({ option, children }) => (
  <View style={styles.item}>
    <View style={styles.row}>
      <Text style={styles.text}>{option.label}</Text>
      {children}
    </View>
  </View>
);

const styles = StyleSheet.create({
  item: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  text: { color: palette.text, fontSize: 18, fontWeight: "600" },
});

export default SettingsItem;
