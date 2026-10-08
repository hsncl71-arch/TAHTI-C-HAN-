import { createFileRoute } from "@tanstack/react-router";
import { LegalSheet } from "@/components/legal/LegalSheet";

export const Route = createFileRoute("/kosullar")({ component: () => <LegalSheet kind="terms" /> });
