import katex from "katex";
import { Fragment } from "react";
import { mathSegments } from "@/lib/math";

// Question text with $…$ math rendered by KaTeX. KaTeX escapes its input, so the HTML is safe.
export function MathText({ text }: { text: string }) {
  return (
    <>
      {mathSegments(text).map((seg, i) =>
        "text" in seg ? (
          <Fragment key={i}>{seg.text}</Fragment>
        ) : (
          <span
            key={i}
            className={seg.display ? "my-1 block text-center" : undefined}
            dangerouslySetInnerHTML={{
              __html: katex.renderToString(seg.tex, { displayMode: seg.display, throwOnError: false }),
            }}
          />
        ),
      )}
    </>
  );
}
