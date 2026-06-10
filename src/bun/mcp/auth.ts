import { randomBytes } from 'node:crypto'

/** A fresh server token: `lmcp_` + 24 random bytes, url-safe base64. */
export function generateToken(): string {
  return `lmcp_${randomBytes(24).toString('base64url')}`
}

/** True only when the request carries exactly `Authorization: Bearer <token>`. */
export function isAuthorized(req: Request, token: string): boolean {
  return req.headers.get('authorization') === `Bearer ${token}`
}
