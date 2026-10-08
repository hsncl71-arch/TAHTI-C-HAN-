import type { ReactNode } from "react";

export function CrescentMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
      <path
        d="M38 12c-11 3-18 14-16 26 2 12 13 19 24 16-7 6-18 7-26 1C10 47 8 32 16 21 22 12 32 9 38 12z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-xl bg-panel/90 p-4 text-ivory shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-gilt)_28%,transparent)] ${className}`}
    >
      {children}
    </section>
  );
}
