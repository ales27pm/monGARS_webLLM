import React, { useEffect, useRef, useState } from "react";
import { View, Button, StyleSheet, Platform, Text } from "react-native";

interface VoiceInputProps {
  onSpeak: (text: string) => Promise<void> | void;
  disabled?: boolean;
  pushToTalk?: boolean;
  captionsEnabled?: boolean;
}

const VoiceInput: React.FC<VoiceInputProps> = ({
  onSpeak,
  disabled = false,
  pushToTalk = true,
  captionsEnabled = true,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const SpeechRecognitionImpl =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionImpl) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognitionImpl();
    recognition.lang = "fr-FR";
    recognition.continuous = !pushToTalk;
    recognition.interimResults = captionsEnabled;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript)
        .join(" ")
        .trim();

      if (transcript.length > 0) {
        setLastTranscript(transcript);
        onSpeak(transcript);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (error: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error", error);
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    setIsSupported(true);

    return () => {
      recognition.stop();
    };
  }, [onSpeak, pushToTalk, captionsEnabled]);

  const handlePress = () => {
    if (!isSupported || Platform.OS !== "web") {
      console.warn("Speech recognition not available on this platform.");
      return;
    }

    if (disabled) return;

    if (!isListening) {
      recognitionRef.current?.start();
      setIsListening(true);
    } else {
      recognitionRef.current?.stop();
    }
  };

  return (
    <View style={styles.container}>
      <Button
        title={isListening ? "Arrêter l'écoute" : "Démarrer la dictée"}
        onPress={handlePress}
        color="#1E90FF"
        disabled={(Platform.OS === "web" && !isSupported) || disabled}
      />
      {lastTranscript ? (
        <Text style={styles.transcriptLabel}>
          Dernière saisie vocale : {lastTranscript}
        </Text>
      ) : null}
      {!isSupported && Platform.OS === "web" ? (
        <Text style={styles.helper}>
          La reconnaissance vocale n'est pas supportée par ce navigateur.
        </Text>
      ) : null}
      {disabled ? (
        <Text style={styles.helper}>Patiente le temps de la génération...</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { padding: 16 },
  transcriptLabel: { marginTop: 8, color: "#fff" },
  helper: { marginTop: 6, color: "#ccc", fontSize: 12 },
});

export default VoiceInput;
