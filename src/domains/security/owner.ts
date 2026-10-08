/** The only account that may hold OWNER / SUPER ADMIN in Taht-ı Cihan. */
export const OWNER_EMAIL = "zunozaofficial@gmail.com";

export const ROLES = ["player", "owner"] as const;
export type StaffRole = (typeof ROLES)[number];

export const AUDIT_SCOPES = [
  "players",
  "realms",
  "world",
  "events",
  "economy",
  "packages",
  "moderation",
  "ban",
  "analytics",
  "server",
  "ai",
  "audit",
] as const;
export type AuditScope = (typeof AUDIT_SCOPES)[number];

export function normalizeEmail(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

export function isOwnerEmail(raw: string | null | undefined): boolean {
  return normalizeEmail(raw) === OWNER_EMAIL;
}

/** Nobody but the locked mailbox can be OWNER. Client flags and DB booleans cannot grant it. */
export function roleForEmail(raw: string | null | undefined): StaffRole {
  return isOwnerEmail(raw) ? "owner" : "player";
}

export function canGrantOwner(actorEmail: string | null | undefined, targetEmail: string | null | undefined): boolean {
  return isOwnerEmail(actorEmail) && isOwnerEmail(targetEmail);
}

export function ownerFromClientClaim(_claimed: unknown): never {
  throw new Error("owner_client_claim");
}
