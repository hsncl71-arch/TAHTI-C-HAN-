import { createFileRoute } from "@tanstack/react-router";
import { GameApp } from "@/components/game/GameApp";

export const Route = createFileRoute("/oyun")({ component: GameApp });
