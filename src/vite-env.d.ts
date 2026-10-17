/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google OAuth client ID for quota tracking (public, not a secret) */
  readonly VITE_GOOGLE_CLIENT_ID?: string
}
