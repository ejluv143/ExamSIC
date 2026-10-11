"use client";

import { useEffect, useState, useTransition } from "react";
import type { Style } from "@dicebear/core";
import clsx from "clsx";
import { Shuffle } from "lucide-react";
import { avatarNone, avatarStyles, type Avatar, type AvatarStyle } from "@examinus/contract";
import { Button } from "@/components/ui";
import { saveAvatarAction } from "@/lib/avatar-actions";
import { choicesOf, drawAvatar, loadStyle, randomSeed, styleLabels } from "@/lib/avatar";

// The loaded DiceBear style, or null while it loads.
function useStyle(name: AvatarStyle): Style | null {
  const [loaded, setLoaded] = useState<{ name: AvatarStyle; style: Style } | null>(null);
  useEffect(() => {
    let live = true;
    loadStyle(name).then(
      (style) => live && setLoaded({ name, style }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [name]);
  return loaded?.name === name ? loaded.style : null;
}

// A player's avatar as a round picture; a grey circle until its style has loaded.
export function AvatarImage({ avatar, size = 40, className, alt = "" }: { avatar: Avatar; size?: number; className?: string; alt?: string }) {
  const style = useStyle(avatar.style);
  const box = { width: size, height: size };
  if (!style) return <span aria-hidden={alt === ""} style={box} className={clsx("inline-block shrink-0 rounded-full bg-surface-muted", className)} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={drawAvatar(style, avatar)} alt={alt} style={box} className={clsx("shrink-0 rounded-full", className)} />
  );
}

// Making an avatar: a style, then each part and colour (or the seed's pick), and Shuffle for a new seed.
export function AvatarEditor({ initial, onSaved, onCancel }: { initial: Avatar; onSaved: (avatar: Avatar) => void; onCancel?: () => void }) {
  const [avatar, setAvatar] = useState(initial);
  const [tab, setTab] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const style = useStyle(avatar.style);
  const choices = style ? choicesOf(style) : null;
  const active = choices?.parts.find((p) => p.name === tab) ?? (tab === "colors" ? null : choices?.parts[0]);

  // A choice, or null to leave it to the seed again.
  function choosePart(part: string, variant: string | null) {
    const parts = { ...avatar.parts };
    if (variant === null) delete parts[part];
    else parts[part] = variant;
    setAvatar({ ...avatar, parts });
  }
  function chooseColor(group: string, hex: string | null) {
    const colors = { ...avatar.colors };
    if (hex === null) delete colors[group];
    else colors[group] = hex;
    setAvatar({ ...avatar, colors });
  }
  function save() {
    start(async () => {
      const result = await saveAvatarAction(avatar);
      if ("error" in result) setError(result.error);
      else onSaved(avatar);
    });
  }

  const tile = (selected: boolean) =>
    clsx(
      "grid place-items-center rounded-xl border-2 p-1 transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-primary",
      selected ? "border-primary bg-primary-soft" : "border-transparent bg-surface-muted",
    );

  return (
    <div className="space-y-4 text-left" data-testid="avatar-editor">
      <div className="flex items-center gap-4">
        <AvatarImage key={JSON.stringify(avatar)} avatar={avatar} size={112} alt="Your avatar" className="animate-pop-in" />
        <div className="space-y-2">
          <Button variant="secondary" onClick={() => setAvatar({ ...avatar, seed: randomSeed(), parts: {}, colors: {} })}>
            <Shuffle className="size-4" aria-hidden /> Shuffle
          </Button>
          <p className="text-xs text-muted">Shuffle draws a new face; then change any part below.</p>
        </div>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Style</legend>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {avatarStyles.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={avatar.style === name}
              onClick={() => {
                const background = avatar.colors.background;
                setAvatar({ style: name, seed: avatar.seed, parts: {}, colors: background ? { background } : {} });
                setTab(null);
              }}
              className={clsx(tile(avatar.style === name), "w-20 shrink-0 gap-1 text-xs")}
            >
              <AvatarImage avatar={{ style: name, seed: avatar.seed, parts: {}, colors: {} }} size={48} />
              {styleLabels[name]}
            </button>
          ))}
        </div>
      </fieldset>

      {!choices || !style ? (
        <p className="text-sm text-muted" role="status">
          Loading…
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Parts">
            {[...choices.parts.map((p) => ({ name: p.name, label: p.label })), { name: "colors", label: "Colours" }].map((t) => {
              const selected = t.name === "colors" ? !active : active?.name === t.name;
              return (
                <button
                  key={t.name}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(t.name)}
                  className={clsx(
                    "rounded-full px-3 py-1 text-sm",
                    selected ? "bg-primary text-primary-foreground" : "bg-surface-muted hover:bg-border",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {active ? (
            <div role="tabpanel" aria-label={active.label} className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              <button type="button" aria-pressed={!(active.name in avatar.parts)} onClick={() => choosePart(active.name, null)} className={clsx(tile(!(active.name in avatar.parts)), "text-xs")}>
                <Shuffle className="size-5 text-muted" aria-hidden />
                Any
              </button>
              {active.optional && (
                <button
                  type="button"
                  aria-pressed={avatar.parts[active.name] === avatarNone}
                  onClick={() => choosePart(active.name, avatarNone)}
                  className={tile(avatar.parts[active.name] === avatarNone)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={drawAvatar(style, { ...avatar, parts: { ...avatar.parts, [active.name]: avatarNone } })} alt="None" className="size-14 rounded-full" />
                </button>
              )}
              {active.variants.map((variant, i) => (
                <button
                  key={variant}
                  type="button"
                  aria-pressed={avatar.parts[active.name] === variant}
                  onClick={() => choosePart(active.name, variant)}
                  className={tile(avatar.parts[active.name] === variant)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={drawAvatar(style, { ...avatar, parts: { ...avatar.parts, [active.name]: variant } })}
                    alt={`${active.label} ${i + 1}`}
                    className="size-14 rounded-full"
                  />
                </button>
              ))}
            </div>
          ) : (
            <div role="tabpanel" aria-label="Colours" className="space-y-3">
              {choices.colors.map((group) => (
                <fieldset key={group.name}>
                  <legend className="mb-1 text-sm">{group.label}</legend>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      aria-pressed={!(group.name in avatar.colors)}
                      onClick={() => chooseColor(group.name, null)}
                      className={clsx(
                        "grid size-8 place-items-center rounded-full border-2 bg-surface-muted",
                        !(group.name in avatar.colors) ? "border-primary" : "border-border",
                      )}
                    >
                      <Shuffle className="size-3.5 text-muted" aria-label="Any" />
                    </button>
                    {group.values.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        aria-label={hex}
                        aria-pressed={avatar.colors[group.name] === hex}
                        onClick={() => chooseColor(group.name, hex)}
                        style={{ backgroundColor: hex }}
                        className={clsx(
                          "size-8 rounded-full border-2 transition-transform hover:scale-110",
                          avatar.colors[group.name] === hex ? "border-primary ring-2 ring-primary" : "border-border",
                        )}
                      />
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save avatar"}
        </Button>
      </div>
    </div>
  );
}
