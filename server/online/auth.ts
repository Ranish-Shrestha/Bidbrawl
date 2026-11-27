import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const cookieName = '__Host-draft-online'
const lifetimeSeconds = 48 * 60 * 60
const sessionPattern = /^([A-Za-z0-9_-]{43})\.(\d{10})\.([a-f0-9]{64})$/

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function digest(pepper: string, scope: string, value: string): string {
  return createHmac('sha256', pepper).update(scope).update('\0').update(value).digest('hex')
}

export function equalDigest(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function mintSession(pepper: string, now = Date.now()): string {
  const ticket = `${randomToken()}.${Math.floor(now / 1000) + lifetimeSeconds}`
  const signature = digest(pepper, 'cookie', ticket)
  return `${cookieName}=${ticket}.${signature}; Path=/; Max-Age=${lifetimeSeconds}; Secure; HttpOnly; SameSite=Lax`
}

export function readSession(request: Request, pepper: string, now = Date.now()): string | null {
  const prefix = `${cookieName}=`
  const token = request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length)
  const result = token?.match(sessionPattern)
  if (!result || Number(result[2]) <= Math.floor(now / 1000)) return null
  const [, nonce, expiry, signature] = result
  if (!equalDigest(digest(pepper, 'cookie', `${nonce}.${expiry}`), signature!)) return null
  return digest(pepper, 'seat', nonce!)
}
