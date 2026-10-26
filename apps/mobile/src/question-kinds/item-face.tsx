// An item of matching, ordering or categorization: its text and its picture.
import { View } from "react-native";
import { AssetImage, Markdown } from "@/markdown/markdown";

export type FaceItem = { text: string; imageId?: string; alt?: string };

export function ItemFace({
  item,
  assetUrls,
  height = 96,
  small = false,
}: {
  item: FaceItem | undefined;
  assetUrls: Readonly<Record<string, string>>;
  height?: number;
  small?: boolean;
}) {
  if (!item) return null;
  return (
    <View className="min-w-0 flex-1 gap-1">
      {item.text !== "" && (
        <Markdown inline small={small} assetUrls={assetUrls}>
          {item.text}
        </Markdown>
      )}
      {item.imageId !== undefined && item.imageId !== "" && (
        <AssetImage id={item.imageId} alt={item.alt ?? ""} assetUrls={assetUrls} height={height} />
      )}
    </View>
  );
}
