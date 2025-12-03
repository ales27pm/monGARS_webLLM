import React from "react";
import { View, FlatList, StyleSheet } from "react-native";
import SettingsItem from "../components/SettingsItem";

const settingsOptions = [
  { key: "theme", label: "Theme (Light/Dark)" },
  { key: "model", label: "Model Selection" },
  { key: "maxTokens", label: "Max Tokens" },
];

const SettingsScreen: React.FC = () => (
  <View style={styles.container}>
    <FlatList
      data={settingsOptions}
      renderItem={({ item }) => <SettingsItem option={item} />}
      keyExtractor={(item) => item.key}
    />
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
});

export default SettingsScreen;
