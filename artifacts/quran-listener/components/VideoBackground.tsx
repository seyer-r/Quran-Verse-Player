/**
 * VideoBackground
 *
 * Renders a full-screen, muted, looping background video.
 *
 * On web  : uses a raw HTML <video> element (React Native Web supports
 *            React.createElement with HTML tag names because it renders to DOM).
 * On native: returns null for now — native support can be added later with
 *            expo-video's VideoView once the app targets iOS/Android natively.
 */

import React, { useEffect, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";

interface VideoBackgroundProps {
  url: string;
}

export function VideoBackground({ url }: VideoBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.src = url;
    el.load();
    el.play().catch(() => {});
  }, [url]);

  if (Platform.OS !== "web") return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {React.createElement("video", {
        ref: videoRef,
        src: url,
        autoPlay: true,
        loop: true,
        muted: true,
        playsInline: true,
        controls: false,
        disablePictureInPicture: true,
        disableRemotePlayback: true,
        tabIndex: -1,
        style: {
          position: "absolute" as const,
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover" as const,
          pointerEvents: "none" as const,
          // Suppress the browser's native "not playing" overlay in all browsers
          outline: "none",
        },
      })}
    </View>
  );
}

/** Tiny inline video for swatch thumbnails in the Settings picker. */
export function VideoSwatch({ url }: { url: string }) {
  if (Platform.OS !== "web") return null;
  return (
    <View style={StyleSheet.absoluteFill}>
      {React.createElement("video", {
        src: url,
        autoPlay: true,
        loop: true,
        muted: true,
        playsInline: true,
        controls: false,
        disablePictureInPicture: true,
        disableRemotePlayback: true,
        tabIndex: -1,
        style: {
          position: "absolute" as const,
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover" as const,
          pointerEvents: "none" as const,
          outline: "none",
        },
      })}
    </View>
  );
}
