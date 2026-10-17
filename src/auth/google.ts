/**
 * "Sign in with Google" for quota tracking, using Google Identity Services (token model).
 * Read-only scopes only: the email (to show who is signed in), Cloud Monitoring (usage and
 * limits) and the project list (to pick the AI Studio project). The access token lives in
 * memory for its 1-hour lifetime and is never stored.
 *
 * Production only: works on the deployed site (GitHub Pages build), never in local development
 * (`pnpm dev`). Needs an OAuth client ID (public, not a secret) in the VITE_GOOGLE_CLIENT_ID build
 * variable, set from the GOOGLE_CLIENT_ID repository variable by the deploy workflow.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/monitoring.read',
  'https://www.googleapis.com/auth/cloud-platform.read-only',
].join(' ')

/** True only in production builds; local development never offers Google sign-in. */
export const googleAuthSupported = import.meta.env.PROD

export const googleClientId = googleAuthSupported ? (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim() : ''

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void
}

interface GoogleOAuth {
  initTokenClient(config: {
    client_id: string
    scope: string
    prompt?: string
    callback: (response: TokenResponse) => void
    error_callback?: (error: { type?: string; message?: string }) => void
  }): TokenClient
  revoke(token: string, done?: () => void): void
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth } }
  }
}

let loading: Promise<GoogleOAuth> | null = null
let token: { value: string; expiresAt: number } | null = null

/** Loads the Google Identity Services script. Call early so the sign-in popup opens inside the tap. */
export function loadGoogleIdentity(): Promise<GoogleOAuth> {
  loading ??= new Promise((resolve, reject) => {
    const ready = () => (window.google?.accounts?.oauth2 ? resolve(window.google.accounts.oauth2) : undefined)
    if (window.google?.accounts?.oauth2) return ready()
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.onload = () => (window.google?.accounts?.oauth2 ? ready() : reject(new Error('Google sign-in failed to load.')))
    script.onerror = () => {
      loading = null
      reject(new Error('Could not load Google sign-in. Check your connection.'))
    }
    document.head.append(script)
  })
  return loading
}

/** Opens Google's sign-in popup. Call from a click. Resolves with an access token. */
export async function signInWithGoogle(): Promise<string> {
  if (!googleAuthSupported) throw new Error('Google sign-in only works on the deployed site, not in local development.')
  if (!googleClientId) throw new Error('Quota tracking is not set up: the Google OAuth client ID is missing.')
  const oauth = await loadGoogleIdentity()
  return new Promise((resolve, reject) => {
    const client = oauth.initTokenClient({
      client_id: googleClientId,
      scope: SCOPES,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || 'Sign-in was cancelled.'))
          return
        }
        token = { value: response.access_token, expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 }
        resolve(response.access_token)
      },
      error_callback: (error) => reject(new Error(error.message || (error.type === 'popup_closed' ? 'Sign-in was cancelled.' : 'Sign-in failed.'))),
    })
    client.requestAccessToken()
  })
}

/** The current access token, or null when signed out or expired. */
export function googleAccessToken(): string | null {
  if (!token || Date.now() > token.expiresAt - 60_000) return null
  return token.value
}

export function signOutOfGoogle(): void {
  if (token) window.google?.accounts?.oauth2?.revoke(token.value)
  token = null
}

export async function fetchGoogleEmail(accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return ''
  const body = (await res.json()) as { email?: string }
  return body.email ?? ''
}
