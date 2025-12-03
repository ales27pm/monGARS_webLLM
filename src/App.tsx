import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { ChatProvider } from "./context/ChatContext";
import HomeScreen from "./screens/HomeScreen";
import VoiceModeScreen from "./screens/VoiceModeScreen";
import SettingsScreen from "./screens/SettingsScreen";
import ReasoningScreen from "./screens/ReasoningScreen";
import CapabilitiesScreen from "./screens/CapabilitiesScreen";
import { DarkThemeCustom } from "./theme";

const Stack = createStackNavigator();

export default function App() {
  return (
    <ChatProvider>
      <NavigationContainer theme={DarkThemeCustom}>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle: { backgroundColor: DarkThemeCustom.colors.card },
            headerTintColor: DarkThemeCustom.colors.text,
            headerTitleStyle: { fontWeight: "bold" },
            presentation: "card",
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: "Mon Gars" }} />
          <Stack.Screen name="Voice" component={VoiceModeScreen} options={{ title: "Voice Mode" }} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Reasoning" component={ReasoningScreen} options={{ title: "Reasoning" }} />
          <Stack.Screen name="Capabilities" component={CapabilitiesScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </ChatProvider>
  );
}
