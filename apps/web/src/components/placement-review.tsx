import clsx from "clsx";
import { Check, X } from "lucide-react";
import { AssetImage } from "@/components/asset-image";
import { Markdown } from "@/components/markdown";
import { HotspotView } from "@/components/hotspot-view";
import {
  categorizationResults,
  hotspotResults,
  orderingResults,
  parseCategorizationAnswer,
  parseHotspotAnswer,
  parseOrderingAnswer,
} from "@examora/contract";
import type { AnswerValue, CategorizationQuestion, HotspotQuestion, OrderingQuestion } from "@examora/contract";

type Item = { text: string; imageId?: string; alt?: string };

function ItemContent({ item, assetUrls }: { item: Item | undefined; assetUrls: Record<string, string> }) {
  if (!item) return null;
  return (
    <span className="min-w-0 flex-1">
      {item.text && (
        <Markdown inline assetUrls={assetUrls}>
          {item.text}
        </Markdown>
      )}
      {item.imageId && (
        <AssetImage id={item.imageId} alt={item.alt ?? ""} assetUrls={assetUrls} className="mt-1 block max-h-24" />
      )}
    </span>
  );
}

function Mark({ correct }: { correct: boolean }) {
  return correct ? (
    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="Correct" />
  ) : (
    <X className="mt-0.5 size-4 shrink-0 text-danger" aria-label="Wrong" />
  );
}

// The student's sorting: a box per category with the items they put there, then the items left unsorted.
export function CategorizationReview({
  q,
  value,
  assetUrls,
  showKey,
}: {
  q: CategorizationQuestion;
  value?: AnswerValue;
  assetUrls: Record<string, string>;
  showKey: boolean;
}) {
  const results = categorizationResults(q, value ?? null);
  const given = parseCategorizationAnswer(value);
  const itemOf = (id: string) => q.items.find((i) => i.id === id);
  const categoryName = (id: string | null) => q.categories.find((c) => c.id === id)?.name;
  const boxes = [
    ...q.categories.map((c) => ({ id: c.id as string | null, name: c.name, description: c.description })),
    { id: null as string | null, name: "Unsorted", description: undefined },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {boxes.map((box) => {
        // Only items the student placed show in a category; the rest of the items are unsorted.
        const placed = results.filter((r) => (box.id === null ? r.given === null : r.given === box.id));
        return (
          <section key={box.id ?? "unsorted"} aria-label={box.name} className="rounded-md border border-border p-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{box.name}</h4>
            {box.description && (
              <Markdown className="text-xs text-muted" assetUrls={assetUrls}>
                {box.description}
              </Markdown>
            )}
            {placed.length === 0 ? (
              <p className="mt-1 text-xs italic text-muted">{box.id === null ? "Nothing left unsorted" : "Nothing here"}</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {placed.map((r) => {
                  const item = itemOf(r.itemId);
                  const right = item?.categoryId ?? null;
                  return (
                    <li
                      key={r.itemId}
                      className={clsx("flex items-start gap-2 rounded px-1.5 py-1", r.correct ? "bg-success-soft" : "bg-danger-soft")}
                    >
                      <Mark correct={r.correct} />
                      <ItemContent item={item} assetUrls={assetUrls} />
                      {showKey && !r.correct && (
                        <span className="shrink-0 text-xs text-success">
                          {right === null ? "Belongs nowhere (leave unsorted)" : `Belongs in ${categoryName(right) ?? "—"}`}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
      <span className="sr-only">
        {results.filter((r) => r.correct).length} of {results.length} items in the right place
        {Object.keys(given).length === 0 && "; nothing was sorted"}
      </span>
    </div>
  );
}

// The student's order as a numbered list with a mark per position; with the key, the correct order beside it.
export function OrderingReview({
  q,
  value,
  assetUrls,
  showKey,
}: {
  q: OrderingQuestion;
  value?: AnswerValue;
  assetUrls: Record<string, string>;
  showKey: boolean;
}) {
  const order = parseOrderingAnswer(q, value ?? null);
  const results = orderingResults(q, value ?? null);
  const itemOf = (id: string) => q.items.find((i) => i.id === id);
  if (!order) return <p className="italic text-muted">No answer</p>;
  return (
    <div className={clsx("grid gap-3", showKey && "sm:grid-cols-2")}>
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Your order</h4>
        <ol className="mt-1 space-y-1">
          {order.map((id, i) => (
            <li
              key={id}
              className={clsx("flex items-start gap-2 rounded px-1.5 py-1", results[i]?.correct ? "bg-success-soft" : "bg-danger-soft")}
            >
              <span className="w-5 shrink-0 text-right tabular-nums text-muted">{i + 1}.</span>
              <Mark correct={results[i]?.correct ?? false} />
              <ItemContent item={itemOf(id)} assetUrls={assetUrls} />
            </li>
          ))}
        </ol>
      </div>
      {showKey && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Correct order</h4>
          <ol className="mt-1 space-y-1">
            {q.items.map((item, i) => (
              <li key={item.id} className="flex items-start gap-2 rounded px-1.5 py-1">
                <span className="w-5 shrink-0 text-right tabular-nums text-muted">{i + 1}.</span>
                <ItemContent item={item} assetUrls={assetUrls} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// The student's clicks on the picture with the correct areas outlined, and how many areas they found.
export function HotspotReview({
  q,
  value,
  assetUrls,
}: {
  q: HotspotQuestion;
  value?: AnswerValue;
  assetUrls: Record<string, string>;
}) {
  const markers = parseHotspotAnswer(value);
  if (markers.length === 0) return <p className="italic text-muted">No answer</p>;
  const { hit, outside } = hotspotResults(q, markers);
  return (
    <div className="space-y-1">
      <HotspotView
        imageId={q.imageId}
        alt={q.alt}
        assetUrls={assetUrls}
        markers={markers}
        regions={q.regions}
        tolerance={q.tolerance}
        className="max-w-lg"
      />
      <p className="text-xs text-muted">
        {hit.filter(Boolean).length} of {q.regions.length} areas found
        {outside > 0 && `; ${outside} ${outside === 1 ? "click" : "clicks"} outside every area`}
      </p>
    </div>
  );
}
