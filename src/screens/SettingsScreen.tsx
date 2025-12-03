import React, { useContext, useMemo, useState } from "react";
import { View, StyleSheet, Text, Switch, TextInput } from "react-native";
import SettingsItem from "../components/SettingsItem";
import { palette } from "../theme";
import { ChatContext } from "../context/ChatContext";
import { DEFAULT_MODEL_ID, MODEL_REGISTRY } from "../../models";

const SettingsScreen: React.FC = () => {
  const { theme, setTheme, config, updateConfig, isGenerating } =
    useContext(ChatContext);
  const [maxTokens, setMaxTokens] = useState(String(config.maxTokens));
  const [model, setModel] = useState(config.modelId);
  const [temperature, setTemperature] = useState(String(config.temperature));

  const parsedTokens = useMemo(
    () => Number.parseInt(maxTokens, 10) || 0,
    [maxTokens],
  );

  const parsedTemperature = useMemo(
    () => Number.parseFloat(temperature) || config.temperature,
    [temperature, config.temperature],
  );

  const applyModel = () => {
    const trimmed = model.trim();
    updateConfig({ modelId: trimmed || DEFAULT_MODEL_ID });
  };

  const applyMaxTokens = () => {
    const safeValue = Math.max(32, Math.min(parsedTokens, 2048));
    updateConfig({ maxTokens: safeValue });
    setMaxTokens(String(safeValue));
  };

  const applyTemperature = () => {
    const safeValue = Math.max(0, Math.min(parsedTemperature, 1.5));
    setTemperature(String(safeValue));
    updateConfig({ temperature: safeValue });
  };

  return (
    <View style={styles.container}>
      <View style={styles.block}>
        <SettingsItem option={{ label: "Thème sombre", key: "theme" }}>
          <Switch
            value={theme === "dark"}
            onValueChange={(value) => setTheme(value ? "dark" : "light")}
            trackColor={{ true: palette.accent }}
          />
        </SettingsItem>
      </View>
      <View style={styles.block}>
        <SettingsItem option={{ label: "Modèle WebLLM", key: "model" }}>
          <View style={styles.inputGroup}>
            <TextInput
              style={styles.input}
              value={model}
              onChangeText={setModel}
              onBlur={applyModel}
              placeholder="model-id"
              placeholderTextColor={palette.muted}
              autoCapitalize="none"
              editable={!isGenerating}
            />
            <Text style={styles.helper}>
              {MODEL_REGISTRY[model]?.label || "Saisis un ID de modèle MLC"}
            </Text>
          </View>
        </SettingsItem>
      </View>
      <View style={styles.block}>
        <SettingsItem option={{ label: "Budget de tokens", key: "maxTokens" }}>
          <View style={styles.inputGroup}>
            <TextInput
              style={styles.input}
              value={maxTokens}
              onChangeText={setMaxTokens}
              onBlur={applyMaxTokens}
              keyboardType="numeric"
              placeholder="512"
              placeholderTextColor={palette.muted}
              editable={!isGenerating}
            />
            <Text style={styles.helper}>Actuel : {parsedTokens} tokens</Text>
          </View>
        </SettingsItem>
      </View>
      <View style={styles.block}>
        <SettingsItem option={{ label: "Température", key: "temperature" }}>
          <View style={styles.inputGroup}>
            <TextInput
              style={styles.input}
              value={temperature}
              onChangeText={setTemperature}
              onBlur={applyTemperature}
              keyboardType="decimal-pad"
              placeholder="0.7"
              placeholderTextColor={palette.muted}
              editable={!isGenerating}
            />
            <Text style={styles.helper}>Exploration: {parsedTemperature}</Text>
          </View>
        </SettingsItem>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.background, padding: 12 },
  block: { marginBottom: 10 },
  inputGroup: { marginTop: 4 },
  input: {
    backgroundColor: palette.elevated,
    color: palette.text,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    minWidth: 140,
  },
  helper: { color: palette.muted, marginTop: 2 },
});

export default SettingsScreen;
