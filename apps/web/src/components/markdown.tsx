import clsx from "clsx";
import { Fragment, type ReactNode } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

// Markdown for prompts, choices, instructions, essays and feedback: GitHub-style tables and lists, $…$ and
// $$…$$ math (KaTeX), and {{answer|alt}} blanks. The text is sanitised (no raw HTML, no scripts, http(s) links
// and images only); KaTeX output is added after sanitising because KaTeX escapes its input.

const mathClasses = ["language-math", "math-inline", "math-display"];
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes?.span ?? []), ["className", ...mathClasses]],
    div: [...(defaultSchema.attributes?.div ?? []), ["className", ...mathClasses]],
    code: [...(defaultSchema.attributes?.code ?? []), ["className", ...mathClasses]],
  },
} satisfies typeof defaultSchema;

// A blank is swapped for a private-use marker before parsing and back to an element after sanitising.
const blankPattern = /\{\{([^{}]*)\}\}/g;
const markerPattern = /\uE000(\d+)\uE001/;

type HastNode = { type: string; value?: string; tagName?: string; properties?: Record<string, unknown>; children?: HastNode[] };

function placeBlanks(node: HastNode) {
  if (!node.children) return;
  node.children = node.children.flatMap((child) => {
    if (child.type !== "text" || !child.value || !markerPattern.test(child.value)) {
      placeBlanks(child);
      return [child];
    }
    return child.value.split(/(\uE000\d+\uE001)/).flatMap((piece): HastNode[] => {
      const m = piece.match(markerPattern);
      if (m) return [{ type: "element", tagName: "span", properties: { dataBlank: m[1] }, children: [] }];
      return piece ? [{ type: "text", value: piece }] : [];
    });
  });
}

const rehypeBlanks = () => (tree: HastNode) => placeBlanks(tree);

export const blankLine = <span className="mx-0.5 inline-block min-w-16 border-b-2 border-foreground/60 align-baseline">&nbsp;</span>;

export function Markdown({
  children,
  className,
  inline,
  renderBlank,
}: {
  children: string;
  className?: string;
  // No paragraph around the text, for short text inside a line (a choice, a table cell).
  inline?: boolean;
  // What to show for each {{blank}}; `answers` are the alternatives written in it (empty for a student's copy).
  renderBlank?: (index: number, answers: string[]) => ReactNode;
}) {
  const blanks: string[][] = [];
  const source = children.replace(blankPattern, (_, raw: string) => {
    blanks.push(raw.split("|").map((x) => x.trim()).filter(Boolean));
    return `\uE000${blanks.length - 1}\uE001`;
  });
  const components: Components = {
    a: ({ href, title, children }) => (
      <a href={href} title={title} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
    span: (props) => {
      const index = (props as Record<string, unknown>)["data-blank"];
      if (index === undefined) {
        // KaTeX's spans carry classes and inline styles; `node` is react-markdown's own prop.
        const domProps = Object.fromEntries(Object.entries(props).filter(([key]) => key !== "node"));
        return <span {...domProps} />;
      }
      const i = Number(index);
      return <>{renderBlank ? renderBlank(i, blanks[i] ?? []) : blankLine}</>;
    },
    ...(inline ? { p: ({ children }) => <Fragment>{children}</Fragment> } : {}),
  };
  const plugins: Pick<Options, "remarkPlugins" | "rehypePlugins"> = {
    remarkPlugins: [remarkGfm, [remarkMath, { singleDollarTextMath: true }]],
    rehypePlugins: [[rehypeSanitize, schema], [rehypeKatex, { throwOnError: false }], rehypeBlanks],
  };
  const body = (
    <ReactMarkdown {...plugins} components={components}>
      {source}
    </ReactMarkdown>
  );
  return inline ? <span className={className}>{body}</span> : <div className={clsx("markdown", className)}>{body}</div>;
}
