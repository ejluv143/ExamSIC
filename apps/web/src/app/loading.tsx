import { LogoMark } from "@/components/logo";

// Shown while a page outside the signed-in areas loads, including the first visit to the site.
export default function Loading() {
  return (
    <div role="status" className="grid flex-1 place-items-center bg-background px-4 py-24">
      <div className="flex flex-col items-center gap-5">
        <div className="relative grid size-20 place-items-center">
          <span className="absolute inset-0 rounded-[1.6rem] border-2 border-primary/20 border-t-primary motion-safe:animate-spin" />
          <LogoMark className="size-14 motion-safe:animate-pulse" />
        </div>
        <p className="text-sm font-medium text-muted">Loading Examora…</p>
      </div>
    </div>
  );
}
