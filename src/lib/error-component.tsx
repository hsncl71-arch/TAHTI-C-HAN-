import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

const FALLBACK_MESSAGE = "Beklenmeyen bir hadise. Sayfayı yenileyin.";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink px-6 text-center text-ivory">
      <span className="text-crimson" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="font-display text-2xl">Divan kesildi</h1>
      <p className="max-w-md text-sm break-words text-silk">{errorMessage(error)}</p>
    </main>
  );
}