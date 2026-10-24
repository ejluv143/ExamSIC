// `Modal` with the app's theme variables: a modal's content is drawn outside the tree the theme wraps, so NativeWind's
// colour classes (`bg-surface`, `text-foreground`) would resolve to nothing in it.
import { colorVars } from "@examinus/theme/tokens";
import { vars } from "nativewind";
import { useMemo } from "react";
import { Modal as NativeModal, View, useColorScheme, type ModalProps } from "react-native";

export function Modal({ children, ...props }: ModalProps) {
  const mode = useColorScheme() === "dark" ? "dark" : "light";
  const style = useMemo(() => vars(colorVars(mode)), [mode]);
  return (
    <NativeModal {...props}>
      <View style={[{ flex: 1 }, style]}>{children}</View>
    </NativeModal>
  );
}
