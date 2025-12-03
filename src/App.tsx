import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { ChatProvider } from "./context/ChatContext";
import HomeScreen from "./screens/HomeScreen";
import VoiceModeScreen from "./screens/VoiceModeScreen";
import SettingsScreen from "./screens/SettingsScreen";
import ReasoningScreen from "./screens/ReasoningScreen";
import CapabilitiesScreen from "./screens/CapabilitiesScreen";

const Stack = createStackNavigator();

export default function App() {
  return (
    <ChatProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Home">
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Voice" component={VoiceModeScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Reasoning" component={ReasoningScreen} />
          <Stack.Screen name="Capabilities" component={CapabilitiesScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </ChatProvider>
  );
}
