import { Ionicons } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";
import React from "react";
import { Platform, type StyleProp, type ViewStyle } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";

export interface SymbolIconProps {
  name: SFSymbol;
  iosName?: SFSymbol;
  fallbackIonicon: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: string;
  weight?: "ultraLight" | "thin" | "light" | "regular" | "medium" | "semibold" | "bold" | "heavy" | "black";
  style?: StyleProp<ViewStyle>;
}

/**
 * Renders an SF Symbol on iOS (via expo-symbols) and the closest
 * Ionicons equivalent on Android and Web.
 *
 * Usage:
 *   <SymbolIcon name="gearshape" fallbackIonicon="settings-outline" size={22} color="#fff" />
 */
export function SymbolIcon({
  name,
  fallbackIonicon,
  size = 22,
  color = "#fff",
  weight = "regular",
  style,
}: SymbolIconProps) {
  if (Platform.OS === "ios") {
    return (
      <SymbolView
        name={name}
        size={size}
        tintColor={color}
        weight={weight}
        style={[{ width: size, height: size }, style]}
        fallback={
          <Ionicons name={fallbackIonicon} size={size} color={color} />
        }
      />
    );
  }

  return <Ionicons name={fallbackIonicon} size={size} color={color} />;
}
