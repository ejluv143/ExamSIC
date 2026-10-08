"use client";

import { createPortal, useFormStatus } from "react-dom";
import { LogoMark } from "@/components/logo";

// A full-screen "Signing you in…" while a sign-in, sign-up or sign-out is sent and the next page loads. It's put on
// <body> because the auth card's backdrop blur would otherwise pin a fixed overlay to the card.
export function AuthLoading({ show, title, detail }: { show: boolean; title: string; detail: string }) {
  if (!show || typeof document === "undefined") return null;
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[100] grid place-items-center bg-[#0b1326]/80 px-4 backdrop-blur-md motion-safe:animate-[fade-in_200ms_ease-out]"
    >
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="relative grid size-24 place-items-center">
          <span className="absolute inset-0 rounded-[1.9rem] border-2 border-white/10 border-t-[#a5b4fc] motion-safe:animate-spin" />
          <span
            aria-hidden
            className="absolute inset-3 rounded-[1.4rem] bg-[#6366f1]/30 blur-xl motion-safe:animate-pulse"
          />
          <LogoMark className="relative size-14" />
        </div>
        <div>
          <p className="text-lg font-semibold text-white">{title}</p>
          <p className="mt-1 text-sm text-[#c7c4d7]">{detail}</p>
        </div>
        <div aria-hidden className="h-1 w-48 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-[#6366f1] to-[#38bdf8] motion-safe:animate-slide" />
        </div>
      </div>
    </div>,
    document.body,
  );
}

// For a form whose action isn't tracked with useActionState: shows the loader while that form is sending.
export function FormLoading({ title, detail }: { title: string; detail: string }) {
  const { pending } = useFormStatus();
  return <AuthLoading show={pending} title={title} detail={detail} />;
}
