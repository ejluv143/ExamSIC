// A `TextInput` that follows the session's paste and copy rules (the web's `blockPaste`, `blockCopy`, `bulk_input`).
// The long-press menu is hidden where paste or copy is blocked. A phone can't tell a paste from the keyboard
// suggesting a clipboard entry, so text that arrives in one go is judged by its size, like the web's bulk-input check:
// with paste blocked it is refused and logged as a paste; otherwise it is accepted and logged as bulk input.
import { integrityNotice } from "@examinus/copy/integrity";
import { useRef, type ComponentRef, type Ref } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { useInputGuard } from "@/platform/input-guard";

// More characters appearing in one go isn't typing.
const bulkInputChars = 30;

// `code`: the code editor, where paste can stay allowed (`allowPasteInCode`).
export function GuardedTextInput({
  code = false,
  ref,
  value,
  onChangeText,
  contextMenuHidden,
  ...input
}: TextInputProps & { code?: boolean; ref?: Ref<ComponentRef<typeof TextInput>> }) {
  const guard = useInputGuard();
  const lastLength = useRef(0);
  const pasteBlocked = guard !== null && guard.blockPaste && !(code && guard.allowPasteInCode);
  const hidden = contextMenuHidden || pasteBlocked || guard?.blockCopy === true || guard?.blockRightClick === true;
  return (
    <TextInput
      {...input}
      ref={ref}
      value={value}
      contextMenuHidden={hidden}
      onChangeText={(next) => {
        const before = typeof value === "string" ? value.length : lastLength.current;
        if (guard && next.length - before > bulkInputChars) {
          if (pasteBlocked) {
            guard.emit.record("paste", { notice: integrityNotice.paste });
            return;
          }
          guard.emit.record(guard.blockPaste ? "paste" : "bulk_input", guard.blockPaste ? undefined : { notice: integrityNotice.bulkInput });
        }
        lastLength.current = next.length;
        onChangeText?.(next);
      }}
    />
  );
}
