import React, { useContext } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { ChatProvider, ChatContext } from "./context/ChatContext";
import HomeScreen from "./screens/HomeScreen";
import VoiceModeScreen from "./screens/VoiceModeScreen";
import SettingsScreen from "./screens/SettingsScreen";
import ReasoningScreen from "./screens/ReasoningScreen";
import CapabilitiesScreen from "./screens/CapabilitiesScreen";
import { DarkThemeCustom, LightTheme } from "./theme";

const Stack = createStackNavigator();

const NavigatorShell = () => {
  const { theme } = useContext(ChatContext);
  const navTheme = theme === "dark" ? DarkThemeCustom : LightTheme;

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: navTheme.colors.card },
          headerTintColor: navTheme.colors.text,
          headerTitleStyle: { fontWeight: "bold" },
          presentation: "card",
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: "Mon Gars" }}
        />
        <Stack.Screen
          name="Voice"
          component={VoiceModeScreen}
          options={{ title: "Mode Voix" }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: "Paramètres" }}
        />
        <Stack.Screen
          name="Reasoning"
          component={ReasoningScreen}
          options={{ title: "Raisonnement" }}
        />
        <Stack.Screen
          name="Capabilities"
          component={CapabilitiesScreen}
          options={{ title: "Capacités" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default function App() {
  return (
    <ChatProvider>
      <NavigatorShell />
    </ChatProvider>
  );
}
