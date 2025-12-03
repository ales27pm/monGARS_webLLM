import React, { useMemo, useState } from "react";
import { View, StyleSheet, Text, Switch, TextInput } from "react-native";
import SettingsItem from "../components/SettingsItem";
import { palette } from "../theme";

const SettingsScreen: React.FC = () => {
  const [darkMode, setDarkMode] = useState(true);
  const [maxTokens, setMaxTokens] = useState("512");
  const [model, setModel] = useState("web-llm-default");

  const parsedTokens = useMemo(() => Number.parseInt(maxTokens, 10) || 0, [maxTokens]);

  return (
    <View style={styles.container}>
      <View style={styles.block}>
        <SettingsItem option={{ label: "Thème sombre", key: "theme" }}>
          <Switch value={darkMode} onValueChange={setDarkMode} trackColor={{ true: palette.accent }} />
        </SettingsItem>
      </View>
      <View style={styles.block}>
        <SettingsItem option={{ label: "Modèle WebLLM", key: "model" }}>
          <TextInput
            style={styles.input}
            value={model}
            onChangeText={setModel}
            placeholder="model-id"
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
          />
        </SettingsItem>
      </View>
      <View style={styles.block}>
        <SettingsItem option={{ label: "Budget de tokens", key: "maxTokens" }}>
          <TextInput
            style={styles.input}
            value={maxTokens}
            onChangeText={setMaxTokens}
            keyboardType="numeric"
            placeholder="512"
            placeholderTextColor={palette.muted}
          />
          <Text style={styles.helper}>Actuel : {parsedTokens} tokens</Text>
        </SettingsItem>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background, padding: 12 },
  block: { marginBottom: 10 },
  input: {
    backgroundColor: palette.elevated,
    color: palette.text,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    minWidth: 140,
  },
  helper: { color: palette.muted, marginTop: 6 },
});

export default SettingsScreen;
