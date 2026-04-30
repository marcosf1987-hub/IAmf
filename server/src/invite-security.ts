import type { Response } from "express";

/** Public invite flows should not disclose if token exists/expired/used. */
export function replyGenericInviteError(res: Response): void {
  res.status(404).json({ error: "invalid_invite" });
}

