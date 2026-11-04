"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Node, type Editor } from "@tiptap/core";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState, type NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import katex from "katex";
import { Bold, Braces, Code, ImagePlus, Italic, Link2, List, ListOrdered, Sigma, Strikethrough, type LucideIcon } from "lucide-react";
import { assetIdsIn, assetMimes } from "@examinus/domain/asset";
import { blankMarker, parseBlank } from "@examinus/domain/blanks";
import { uploadImage } from "@/features/assets/upload-image";
import { useAssetUrls } from "@/features/assets/use-asset-urls";
import { Button, inputClass } from "./ui";

// A what-you-see editor for the same markdown the markdown editor writes: bold, italic, code, lists, links, tables,
// pictures, $…$ and $$…$$ math and {{answer}} blanks. The text stays markdown (students, papers and exports read
// it); this only edits it without the syntax. Math and blanks are chips that open a small field to change them.

// Signed URLs of the pictures in the text, for the image chips (node views render inside the editor's React tree).
const AssetUrls = createContext<Record<string, string>>({});

function MathView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const display = node.type.name === "mathBlock";
  const latex = String(node.attrs.latex ?? "");
  const [editing, setEditing] = useState<boolean>(Boolean(node.attrs.fresh));
  const [draft, setDraft] = useState(latex);
  const commit = () => {
    setEditing(false);
    if (!draft.trim()) return deleteNode();
    updateAttributes({ latex: draft.trim(), fresh: false });
  };
  const Tag = display ? "div" : "span";
  return (
    <NodeViewWrapper as={Tag} className={clsx(display ? "my-2 block" : "inline-block align-middle")}>
      {editing ? (
        <span className="inline-flex items-center gap-1 rounded-lg bg-primary-soft px-1.5 py-1">
          <Sigma className="size-3.5 text-primary" aria-hidden />
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                setDraft(latex);
                setEditing(false);
              }
            }}
            aria-label="Math (LaTeX)"
            placeholder="x^2 + y^2"
            className="w-48 bg-transparent font-mono text-sm outline-none"
          />
        </span>
      ) : (
        <button
          type="button"
          contentEditable={false}
          onClick={() => {
            setDraft(latex);
            setEditing(true);
          }}
          title="Edit math"
          className={clsx(
            "rounded-md px-1 hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-primary",
            selected && "bg-primary-soft ring-2 ring-primary",
          )}
          // KaTeX escapes its input; this is the same rendering the markdown preview uses.
          dangerouslySetInnerHTML={{ __html: katex.renderToString(latex || "?", { displayMode: display, throwOnError: false }) }}
        />
      )}
    </NodeViewWrapper>
  );
}

function BlankView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { answers, boxes } = parseBlank(String(node.attrs.raw ?? ""));
  const [editing, setEditing] = useState<boolean>(Boolean(node.attrs.fresh));
  const [draft, setDraft] = useState(answers.join(" | "));
  const [draftBoxes, setDraftBoxes] = useState(boxes);
  const commit = () => {
    setEditing(false);
    const next = draft.split("|").map((a) => a.trim()).filter(Boolean);
    if (next.length === 0) return deleteNode();
    // The marker without its braces, the way the tokenizer reads it back.
    updateAttributes({ raw: blankMarker(next, draftBoxes).slice(2, -2), fresh: false });
  };
  return (
    <NodeViewWrapper as="span" className="inline-block align-baseline">
      {editing ? (
        <span
          className="inline-flex flex-wrap items-center gap-2 rounded-lg bg-primary-soft px-2 py-1 text-sm"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) commit();
          }}
        >
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") setEditing(false);
            }}
            aria-label="Accepted answers, separated by |"
            placeholder="answer | other answer"
            className="w-44 bg-transparent font-semibold text-primary outline-none"
          />
          <label className="inline-flex items-center gap-1 text-xs text-muted">
            <input type="checkbox" checked={draftBoxes} onChange={(e) => setDraftBoxes(e.target.checked)} className="size-3.5 accent-primary" />
            Letter boxes
          </label>
        </span>
      ) : (
        <button
          type="button"
          contentEditable={false}
          onClick={() => {
            setDraft(answers.join(" | "));
            setDraftBoxes(boxes);
            setEditing(true);
          }}
          title="Edit the blank's answers"
          className={clsx(
            "rounded-md bg-primary-soft px-1.5 font-semibold text-primary underline decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary",
            selected && "ring-2 ring-primary",
          )}
        >
          {boxes && "# "}
          {answers.join(" | ") || "blank"}
        </button>
      )}
    </NodeViewWrapper>
  );
}

function ImageView({ node, selected }: NodeViewProps) {
  const urls = useContext(AssetUrls);
  const src = String(node.attrs.src ?? "");
  const shown = src.startsWith("asset:") ? urls[src.slice("asset:".length)] : src;
  return (
    <NodeViewWrapper as="span" className="inline-block">
      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shown} alt={String(node.attrs.alt ?? "")} className={clsx("max-h-56 rounded-lg", selected && "ring-2 ring-primary")} />
      ) : (
        <span className="inline-flex items-center gap-1 rounded-lg bg-surface-muted px-2 py-1 text-xs text-muted">
          <ImagePlus className="size-3.5" aria-hidden /> {String(node.attrs.alt ?? "") || "Image"}
        </span>
      )}
    </NodeViewWrapper>
  );
}

// An inline atom carrying one attribute: the text between its markdown delimiters.
const fresh = { default: false, renderHTML: () => ({}), parseHTML: () => false };

const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => ({ latex: { default: "" }, fresh }),
  parseHTML: () => [{ tag: "span[data-math-inline]" }],
  renderHTML: ({ node }) => ["span", { "data-math-inline": "" }, `$${node.attrs.latex}$`],
  addNodeView: () => ReactNodeViewRenderer(MathView),
  markdownTokenizer: {
    name: "mathInline",
    level: "inline",
    start: (src) => src.indexOf("$"),
    tokenize: (src) => {
      const m = /^\$(?!\$)((?:\\[\s\S]|[^\\$\n])+?)\$/.exec(src);
      return m ? { type: "mathInline", raw: m[0], text: m[1] } : undefined;
    },
  },
  parseMarkdown: (token, h) => h.createNode("mathInline", { latex: token.text ?? "" }),
  renderMarkdown: (node) => `$${node.attrs?.latex ?? ""}$`,
});

const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  addAttributes: () => ({ latex: { default: "" }, fresh }),
  parseHTML: () => [{ tag: "div[data-math-block]" }],
  renderHTML: ({ node }) => ["div", { "data-math-block": "" }, `$$${node.attrs.latex}$$`],
  addNodeView: () => ReactNodeViewRenderer(MathView),
  markdownTokenizer: {
    name: "mathBlock",
    level: "block",
    start: (src) => src.indexOf("$$"),
    tokenize: (src) => {
      const m = /^\$\$\n?([\s\S]+?)\n?\$\$[ \t]*(?:\n+|$)/.exec(src);
      return m ? { type: "mathBlock", raw: m[0], text: m[1] } : undefined;
    },
  },
  parseMarkdown: (token, h) => h.createNode("mathBlock", { latex: (token.text ?? "").trim() }),
  renderMarkdown: (node) => `$$\n${node.attrs?.latex ?? ""}\n$$`,
});

const BlankNode = Node.create({
  name: "blank",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => ({ raw: { default: "" }, fresh }),
  parseHTML: () => [{ tag: "span[data-blank]" }],
  renderHTML: ({ node }) => ["span", { "data-blank": "" }, `{{${node.attrs.raw}}}`],
  addNodeView: () => ReactNodeViewRenderer(BlankView),
  markdownTokenizer: {
    name: "blank",
    level: "inline",
    start: (src) => src.indexOf("{{"),
    tokenize: (src) => {
      const m = /^\{\{([^{}]*)\}\}/.exec(src);
      return m ? { type: "blank", raw: m[0], text: m[1] } : undefined;
    },
  },
  parseMarkdown: (token, h) => h.createNode("blank", { raw: token.text ?? "" }),
  renderMarkdown: (node) => `{{${node.attrs?.raw ?? ""}}}`,
});

const AssetImage = Image.extend({ addNodeView: () => ReactNodeViewRenderer(ImageView) }).configure({ inline: true });

// What survives a trip through the editor: the words, numbers and the characters that carry meaning. Two texts
// with the same signature differ only in how their markdown is spelled (* or _, list markers, escapes, spacing).
const signature = (text: string) => text.replace(/[\s*_~`>#\\|:\-+.]/g, "");

// The serializer writes some characters as HTML entities. Only a `<` that would start a tag and a `>` that would
// start a quote need it; the rest go back to plain characters, so the markdown stays what a teacher would type
// (and what exports and the markdown editor show).
const plainEntities = (markdown: string) =>
  markdown
    // A `<` stays an entity only where it would open an HTML tag (`<b>`, `</i>`, `<img src…`).
    .replace(/&lt;(?!\/?[a-zA-Z][\w-]*(?:\s|\/?(?:>|&gt;)))/g, "<")
    // Any `>` after something else on its line; one that begins a line keeps its entity.
    .replace(/(?<=\S[^\n]*)&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;(?![a-zA-Z]+;|#\d+;)/g, "&")
    // The serializer ends with blank lines a teacher never typed.
    .replace(/\s+$/, "");

type Tool = { label: string; icon: LucideIcon; active?: (e: Editor) => boolean; run: (e: Editor) => void };

const tools: Tool[] = [
  { label: "Bold", icon: Bold, active: (e) => e.isActive("bold"), run: (e) => e.chain().focus().toggleBold().run() },
  { label: "Italic", icon: Italic, active: (e) => e.isActive("italic"), run: (e) => e.chain().focus().toggleItalic().run() },
  { label: "Strikethrough", icon: Strikethrough, active: (e) => e.isActive("strike"), run: (e) => e.chain().focus().toggleStrike().run() },
  { label: "Code", icon: Code, active: (e) => e.isActive("code"), run: (e) => e.chain().focus().toggleCode().run() },
  { label: "Bulleted list", icon: List, active: (e) => e.isActive("bulletList"), run: (e) => e.chain().focus().toggleBulletList().run() },
  { label: "Numbered list", icon: ListOrdered, active: (e) => e.isActive("orderedList"), run: (e) => e.chain().focus().toggleOrderedList().run() },
  {
    label: "Link",
    icon: Link2,
    active: (e) => e.isActive("link"),
    run: (e) => {
      if (e.isActive("link")) return void e.chain().focus().unsetLink().run();
      const href = window.prompt("Link address", "https://");
      if (href && /^https?:\/\//.test(href)) e.chain().focus().setLink({ href }).run();
    },
  },
  {
    label: "Math",
    icon: Sigma,
    run: (e) => e.chain().focus().insertContent({ type: "mathInline", attrs: { latex: "", fresh: true } }).run(),
  },
];

const noAssetUrls: Record<string, string> = {};
const imageFile = (files: FileList | undefined | null) => [...(files ?? [])].find((f) => f.type.startsWith("image/"));

export function RichTextEditor({
  value,
  onChange,
  label,
  rows = 4,
  placeholder,
  blanks,
  assetUrls,
  images,
  onUnsupported,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  rows?: number;
  placeholder?: string;
  blanks?: boolean;
  assetUrls?: Record<string, string>;
  images?: boolean;
  // The text uses markdown this editor can't show (it would change on the way back): the caller switches to markdown.
  onUnsupported?: () => void;
}) {
  // The markdown last sent out (or received), so an outside change is told apart from the editor's own echo.
  const last = useRef(value);
  const [pending, setPending] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { urls } = useAssetUrls(assetUrls ?? noAssetUrls, [...assetIdsIn(value), ...(pending ? [pending] : [])]);

  async function upload(file: File) {
    setError(null);
    if (!(assetMimes as readonly string[]).includes(file.type)) return setError("Use a PNG, JPEG, WebP or GIF image.");
    setUploading(true);
    try {
      const uploaded = await uploadImage(file, "question");
      setAlt("");
      setPending(uploaded.assetId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The image couldn't be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // Underline is HTML in markdown, which the renderer drops; headings above h3 make no sense in a question.
      StarterKit.configure({ underline: false, heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true } }),
      Markdown,
      TableKit,
      AssetImage,
      MathInline,
      MathBlock,
      BlankNode,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value,
    contentType: "markdown",
    editorProps: {
      attributes: {
        "aria-label": label,
        "aria-multiline": "true",
        role: "textbox",
        class: "markdown max-w-none px-3.5 py-2.5 text-base leading-relaxed outline-none",
        // At least `rows` lines tall, like the markdown editor's text box.
        style: `min-height: calc(${rows} * 1.625em + 1.25rem)`,
      },
      handlePaste: (_view, event) => {
        const file = images ? imageFile(event.clipboardData?.files) : undefined;
        if (!file) return false;
        void upload(file);
        return true;
      },
      handleDrop: (_view, event) => {
        const file = images ? imageFile((event as DragEvent).dataTransfer?.files) : undefined;
        if (!file) return false;
        void upload(file);
        return true;
      },
    },
    onCreate: ({ editor }) => {
      if (signature(plainEntities(editor.getMarkdown())) !== signature(value)) onUnsupported?.();
    },
    onUpdate: ({ editor }) => {
      const markdown = plainEntities(editor.getMarkdown());
      last.current = markdown;
      onChange(markdown);
    },
  });

  // A change from outside (undo in the page, a reset) replaces the content; the editor's own echo doesn't.
  useEffect(() => {
    if (!editor || value === last.current) return;
    last.current = value;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? tools.map((t) => t.active?.(e) ?? false) : tools.map(() => false)),
  });

  function insertImage() {
    if (!editor || !pending || !alt.trim()) return;
    editor.chain().focus().setImage({ src: `asset:${pending}`, alt: alt.trim().replace(/[[\]]/g, "") }).run();
    setPending(null);
    setAlt("");
  }

  const toolButton = "grid size-8 place-items-center rounded-md text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-50";

  return (
    <AssetUrls.Provider value={urls}>
      <div
        className="rounded-lg border border-border bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"
      >
        <div
          role="toolbar"
          aria-label={`Formatting for ${label}`}
          className="flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1"
        >
          {tools.map((tool, i) => (
            <button
              key={tool.label}
              type="button"
              title={tool.label}
              aria-label={tool.label}
              aria-pressed={tool.active ? Boolean(active?.[i]) : undefined}
              disabled={!editor}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor && tool.run(editor)}
              className={clsx(toolButton, active?.[i] && "bg-primary-soft text-primary")}
            >
              <tool.icon className="size-4" aria-hidden />
            </button>
          ))}
          {blanks && (
            <button
              type="button"
              title="Add a blank"
              disabled={!editor}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor?.chain().focus().insertContent({ type: "blank", attrs: { raw: "", fresh: true } }).run()}
              className="ml-1 inline-flex h-8 items-center gap-1 rounded-md bg-primary-soft px-2 text-xs font-semibold text-primary hover:brightness-95"
            >
              <Braces className="size-3.5" aria-hidden /> Blank
            </button>
          )}
          {images && (
            <>
              <button
                type="button"
                title="Insert image"
                aria-label="Insert image"
                disabled={!editor || uploading}
                onClick={() => fileInput.current?.click()}
                className={toolButton}
              >
                <ImagePlus className="size-4" aria-hidden />
              </button>
              <input
                ref={fileInput}
                type="file"
                accept={assetMimes.join(",")}
                className="hidden"
                tabIndex={-1}
                aria-label="Choose an image to insert"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void upload(file);
                }}
              />
            </>
          )}
        </div>
        {pending && (
          <form
            className="flex flex-wrap items-center gap-2 border-b border-border bg-primary-soft/40 px-3 py-2 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              insertImage();
            }}
          >
            {urls[pending] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[pending]} alt="" className="size-10 rounded border border-border object-cover" />
            )}
            <input
              autoFocus
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              aria-label="Describe the image (alt text)"
              placeholder="Describe the image for students who can't see it"
              className={clsx(inputClass, "min-w-48 flex-1")}
            />
            <Button type="submit" disabled={!alt.trim()}>
              Insert image
            </Button>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
          </form>
        )}
        {(uploading || error) && (
          <p role={error ? "alert" : "status"} className={clsx("border-b border-border px-3 py-1.5 text-xs", error ? "text-danger" : "text-muted")}>
            {error ?? "Uploading image…"}
          </p>
        )}
        <EditorContent editor={editor} />
      </div>
    </AssetUrls.Provider>
  );
}
