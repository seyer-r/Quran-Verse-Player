import { setAudioModeAsync } from "expo-audio";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";

SplashScreen.preventAutoHideAsync();

// Configure the global audio session BEFORE any player is constructed.
// This must live in the root layout (not the player screen) so it fires
// before the recitation/ambient players initialize on iOS — otherwise
// the first player to load grabs an exclusive audio session and the
// `mixWithOthers` mode set later doesn't apply to it.
setAudioModeAsync({
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  interruptionMode: "mixWithOthers",
  allowsRecording: false,
  shouldRouteThroughEarpiece: false,
}).catch((err) => {
  if (__DEV__) console.warn("[audio] setAudioModeAsync failed:", err);
});

// Browsers reject HTMLAudioElement.play() with NotAllowedError when the
// caller doesn't have an active user-gesture grant (autoplay policy). On
// native platforms this never happens. Silently swallow only those specific
// rejections so they don't crash the React tree on the web preview.
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  const isAutoplayRejection = (reason: unknown) => {
    if (!reason || typeof reason !== "object") return false;
    const r = reason as { name?: string; message?: string };
    if (r.name === "NotAllowedError" || r.name === "AbortError") return true;
    if (typeof r.message === "string") {
      const m = r.message.toLowerCase();
      return (
        m.includes("not allowed") ||
        m.includes("user agent") ||
        m.includes("user denied permission") ||
        m.includes("interrupted by a call to pause") ||
        m.includes("interrupted by a new load request")
      );
    }
    return false;
  };

  window.addEventListener("unhandledrejection", (event) => {
    if (isAutoplayRejection((event as PromiseRejectionEvent).reason)) {
      event.preventDefault();
    }
  });
}

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#000" },
        animation: "fade",
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    UthmanicHafs: require("../assets/fonts/UthmanicHafs.otf"),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
          <StatusBar style="light" />
          <RootLayoutNav />
        </GestureHandlerRootView>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
