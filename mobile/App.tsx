// App.tsx — Root entry point with navigation, theme, and socket initialization.
import React, { useEffect } from "react";
import { StatusBar, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Home, Clock, Settings } from "lucide-react-native";

import { DashboardScreen } from "./src/screens/DashboardScreen";
import { LiveViewScreen } from "./src/screens/LiveViewScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { HistoryDetailScreen } from "./src/screens/HistoryDetailScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { Colors } from "./src/theme/colors";
import { useSettingsStore } from "./src/store/useSettingsStore";
import { useSocket } from "./src/hooks/useSocket";

// ── Navigation types ─────────────────────────────────────────────
export type RootStackParamList = {
  Tabs: undefined;
  LiveView: undefined;
  HistoryDetail: { runId: string };
};
export type TabParamList = {
  Dashboard: undefined;
  History: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// Dark navigation theme
const NavTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: Colors.bg,
    card: "rgba(7,11,20,0.95)",
    text: Colors.textPrimary,
    border: Colors.border,
    primary: Colors.cyan,
    notification: Colors.purple,
  },
};

// ── Bottom Tab Navigator ─────────────────────────────────────────
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "rgba(7,11,20,0.92)",
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 84 : 64,
          paddingBottom: Platform.OS === "ios" ? 24 : 8,
          elevation: 0,
        },
        tabBarActiveTintColor: Colors.cyan,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarIcon: ({ color, size }) => {
          const iconSize = size - 2;
          if (route.name === "Dashboard") return <Home size={iconSize} color={color} />;
          if (route.name === "History")   return <Clock size={iconSize} color={color} />;
          if (route.name === "Settings")  return <Settings size={iconSize} color={color} />;
          return null;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: "Home" }} />
      <Tab.Screen name="History"   component={HistoryScreen} />
      <Tab.Screen name="Settings"  component={SettingsScreen} />
    </Tab.Navigator>
  );
}

// ── Socket Connector ─────────────────────────────────────────────
// Isolated component so socket is initialized after settings are loaded.
function SocketConnector() {
  useSocket();
  return null;
}

// ── Root App ─────────────────────────────────────────────────────
export default function App() {
  const { loadSettings, loaded } = useSettingsStore();

  useEffect(() => {
    loadSettings();
  }, []);

  if (!loaded) return null; // Render nothing until settings are loaded

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={Colors.bg} />
        <NavigationContainer theme={NavTheme}>
          <SocketConnector />
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: Colors.bg },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="Tabs" component={MainTabs} />
            <Stack.Screen
              name="LiveView"
              component={LiveViewScreen}
              options={{
                headerShown: true,
                title: "Live Agent View",
                headerStyle: { backgroundColor: Colors.bg },
                headerTintColor: Colors.textPrimary,
                headerTitleStyle: { fontWeight: "700" },
                animation: "slide_from_bottom",
              }}
            />
            <Stack.Screen
              name="HistoryDetail"
              component={HistoryDetailScreen}
              options={{
                headerShown: true,
                title: "Run Detail",
                headerStyle: { backgroundColor: Colors.bg },
                headerTintColor: Colors.textPrimary,
                headerTitleStyle: { fontWeight: "700" },
              }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
