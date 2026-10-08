import { createFileRoute } from "@tanstack/react-router";
import { handleIce } from "@/lib/multiplayer/ice.server";

const handle = ({ request }: { request: Request }) => handleIce(request);

export const Route = createFileRoute("/api/ice")({
  server: { handlers: { GET: handle } },
});
