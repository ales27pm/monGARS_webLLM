import React, { useContext } from "react";
import { View, ScrollView, Button, StyleSheet } from "react-native";
import { ChatContext } from "../context/ChatContext";
import ChatBubble from "../components/ChatBubble";
import InputBar from "../components/InputBar";

const HomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { messages, sendMessage } = useContext(ChatContext);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.chatContainer}>
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}
      </ScrollView>
      <InputBar onSend={sendMessage} />
      <View style={styles.navButtons}>
        <Button title="Voice Mode" onPress={() => navigation.navigate("Voice")}></Button>
        <Button title="Settings" onPress={() => navigation.navigate("Settings")}></Button>
        <Button title="Reasoning" onPress={() => navigation.navigate("Reasoning")}></Button>
        <Button title="Capabilities" onPress={() => navigation.navigate("Capabilities")}></Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  chatContainer: { padding: 12 },
  navButtons: { flexDirection: "row", justifyContent: "space-around", padding: 8 },
});

export default HomeScreen;
