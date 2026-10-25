// What the take screen shows for the phone's anti-cheating rules: the Guided Access prompt (iOS), the student's name
// tiled over the exam, and the cover for an external display.
import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useColors } from "@/ui/theme";
import { Notice } from "@/ui/components";
import { guidedAccessEnabled, watch } from "../../modules/examinus-integrity";

// iOS has no app-started pin, so a session that requires the locked screen needs Guided Access on. `missing` is true
// on an iPhone or iPad where it is off; false everywhere else (Android pins itself, the web has nothing to ask).
export function useGuidedAccessMissing(required: boolean): boolean {
  const [enabled, setEnabled] = useState(() => guidedAccessEnabled());
  useEffect(() => {
    if (!required || Platform.OS !== "ios") return;
    return watch({ onGuidedAccess: (event) => setEnabled(event.enabled) });
  }, [required]);
  return required && enabled === false;
}

export const guidedAccessSteps =
  "Turn on Guided Access: Settings › Accessibility › Guided Access. Then come back here, triple-click the side or Home button and tap Start.";

export function GuidedAccessPrompt() {
  return (
    <Notice tone="warning">
      {`Your teacher requires a locked screen for this one. ${guidedAccessSteps} You can start once it is on.`}
    </Notice>
  );
}

// The student's name and email, faint and tiled across the exam, so a photo of the screen can be traced. Touches go
// through it.
export function Watermark({ text }: { text: string }) {
  const colors = useColors();
  const { width, height } = useWindowDimensions();
  const across = Math.hypot(width, height);
  const columns = Math.ceil(across / 220);
  const rows = Math.ceil(across / 90);
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <View
        style={{
          position: "absolute",
          left: (width - across) / 2,
          top: (height - across) / 2,
          width: across,
          height: across,
          transform: [{ rotate: "-25deg" }],
          justifyContent: "space-around",
        }}
      >
        {Array.from({ length: rows }, (_, r) => (
          <View key={r} style={{ flexDirection: "row", justifyContent: "space-around", paddingLeft: r % 2 === 0 ? 0 : 110 }}>
            {Array.from({ length: columns }, (_, c) => (
              <Text key={c} numberOfLines={1} style={{ width: 220, fontSize: 12, color: colors.foreground, opacity: 0.1 }}>
                {text}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}
