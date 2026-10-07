import clsx from "clsx";
import { Fragment, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components, type Options } from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

// Markdown for prompts, choices, instructions, essays and feedback: GitHub-style tables and lists, $…$ and
// $$…$$ math (KaTeX), and {{answer|alt}} blanks. The text is sanitised (no raw HTML, no scripts, http(s) links
// and images only); KaTeX output is added after sanitising because KaTeX escapes its input. Uploaded images are
// written `![alt](asset:<id>)` and shown from `assetUrls` (signed, short-lived URLs by asset id).

const mathClasses = ["language-math", "math-inline", "math-display"];
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes?.span ?? []), ["className", ...mathClasses]],
    div: [...(defaultSchema.attributes?.div ?? []), ["className", ...mathClasses]],
    code: [...(defaultSchema.attributes?.code ?? []), ["className", ...mathClasses]],
  },
  protocols: { ...defaultSchema.protocols, src: [...(defaultSchema.protocols?.src ?? []), "asset"] },
} satisfies typeof defaultSchema;

// A blank is swapped for a private-use marker before parsing and back to an element after sanitising.
const blankPattern = /\{\{([^{}]*)\}\}/g;
const markerPattern = /\uE000(\d+)\uE001/;

type HastNode = { type: string; value?: string; tagName?: string; properties?: Record<string, unknown>; children?: HastNode[] };

type RenderBlank = (index: number, answers: string[]) => ReactNode;

// Swaps each blank marker for a placeholder element carrying what to draw there.
function placeBlanks(node: HastNode, blanks: string[][], renderBlank: RenderBlank | undefined) {
  if (!node.children) return;
  node.children = node.children.flatMap((child) => {
    if (child.type !== "text" || !child.value || !markerPattern.test(child.value)) {
      placeBlanks(child, blanks, renderBlank);
      return [child];
    }
    return child.value.split(/(\uE000\d+\uE001)/).flatMap((piece): HastNode[] => {
      const m = piece.match(markerPattern);
      if (!m) return piece ? [{ type: "text", value: piece }] : [];
      const i = Number(m[1]);
      const content = renderBlank ? renderBlank(i, blanks[i] ?? []) : blankLine;
      return [{ type: "element", tagName: "span", properties: { dataBlank: i, dataContent: content }, children: [] }];
    });
  });
}

// Points `asset:<id>` images at their signed URL (or nothing, so the alt text shows) and sets eager loading.
function placeImages(node: HastNode, assetUrls: Readonly<Record<string, string>> | undefined, eager: boolean) {
  if (node.type === "element" && node.tagName === "img" && node.properties) {
    const src = node.properties.src;
    if (typeof src === "string" && src.startsWith("asset:")) node.properties.src = assetUrls?.[src.slice("asset:".length)];
    node.properties.loading = eager ? "eager" : "lazy";
  }
  node.children?.forEach((child) => placeImages(child, assetUrls, eager));
}

export const blankLine = <span className="mx-0.5 inline-block min-w-16 border-b-2 border-foreground/60 align-baseline">&nbsp;</span>;

// The renderers are defined once. React compares component types by identity: a renderer made anew on each render
// would unmount and remount everything under it, so a student typing in a blank would lose the input after one key.
// What changes per render (the blanks' content, the image URLs) travels on the elements instead.
const components: Components = {
  a: ({ href, title, children }) => (
    <a href={href} title={title} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  img: ({ src, alt, loading }) =>
    typeof src === "string" && src ? (
      // Signed URLs expire and come from another origin, so next/image's optimiser doesn't apply.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt ?? ""} loading={loading} className="my-1 inline-block max-h-80 max-w-full rounded-md" />
    ) : (
      <span className="rounded border border-dashed border-border px-1.5 text-xs text-muted">[image: {alt || "no description"}]</span>
    ),
  span: (props) => {
    const p = props as Record<string, unknown>;
    if (p["data-blank"] !== undefined) return <>{p["data-content"] as ReactNode}</>;
    // KaTeX's spans carry classes and inline styles; `node` is react-markdown's own prop.
    const domProps = Object.fromEntries(Object.entries(props).filter(([key]) => key !== "node"));
    return <span {...domProps} />;
  },
};
const inlineComponents: Components = { ...components, p: ({ children }) => <Fragment>{children}</Fragment> };

const remarkPlugins: Options["remarkPlugins"] = [remarkGfm, [remarkMath, { singleDollarTextMath: true }]];

export function Markdown({
  children,
  className,
  inline,
  renderBlank,
  assetUrls,
  eager = false,
}: {
  children: string;
  className?: string;
  // No paragraph around the text, for short text inside a line (a choice, a table cell).
  inline?: boolean;
  // What to show for each {{blank}}; `answers` are the alternatives written in it (empty for a student's copy).
  renderBlank?: RenderBlank;
  // Where the images are: signed URLs by asset id. An image without one shows its alt text.
  assetUrls?: Readonly<Record<string, string>>;
  // Load images at once. The printed paper needs it: it measures its pages off screen and prints them hidden.
  eager?: boolean;
}) {
  const blanks: string[][] = [];
  const source = children.replace(blankPattern, (_, raw: string) => {
    blanks.push(raw.split("|").map((x) => x.trim()).filter(Boolean));
    return `\uE000${blanks.length - 1}\uE001`;
  });
  const rehypePlugins: Options["rehypePlugins"] = [
    [rehypeSanitize, schema],
    [rehypeKatex, { throwOnError: false }],
    () => (tree: HastNode) => {
      placeBlanks(tree, blanks, renderBlank);
      placeImages(tree, assetUrls, eager);
    },
  ];
  const body = (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={inline ? inlineComponents : components}
      urlTransform={(url) => (url.startsWith("asset:") ? url : defaultUrlTransform(url))}
    >
      {source}
    </ReactMarkdown>
  );
  return inline ? <span className={className}>{body}</span> : <div className={clsx("markdown", className)}>{body}</div>;
}
