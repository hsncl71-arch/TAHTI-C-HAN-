import { createFileRoute } from "@tanstack/react-router";
import { LegalSheet } from "@/components/legal/LegalSheet";

export const Route = createFileRoute("/magaza")({ component: () => <LegalSheet kind="store" /> });
