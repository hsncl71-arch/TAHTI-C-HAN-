/** Pure IDOR / session isolation helpers. Server queries still filter by userId. */

export function assertResourceOwner(actorId: string, ownerId: string, error = "not_member"): void {
  if (!actorId || actorId !== ownerId) throw new Error(error);
}

export function scopedUserIds(actorId: string, requestedId: string | null | undefined): string {
  if (!requestedId || requestedId === actorId) return actorId;
  throw new Error("idor");
}

export function mayMutatePeerField(args: {
  actorId: string;
  hostUserId: string;
  guestUserId: string;
}): boolean {
  return args.actorId === args.hostUserId || args.actorId === args.guestUserId;
}

export function stripForeignWallet(actorId: string, row: { userId: string; sku: string; status: string }) {
  if (row.userId !== actorId) throw new Error("idor");
  return row;
}
