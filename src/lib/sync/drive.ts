/**
 * Google Drive sync, browser-only.
 *
 * The file is written to `appDataFolder` — a hidden per-application folder in
 * the user's own Drive. It does not appear in My Drive, it does not count
 * against the app for anything, and the scope granted (`drive.appdata`) gives
 * no access to any other file the user owns. If they revoke access or delete
 * the app data, nothing else of theirs is touched.
 *
 * No refresh token is stored. Google Identity Services hands out a short-lived
 * access token; when it expires we ask again, silently if consent still stands.
 */

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const FILE_NAME = 'financial-os-state.json'

interface TokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

interface TokenClient {
  requestAccessToken: (opts?: { prompt?: string }) => void
  callback: (resp: TokenResponse) => void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (resp: TokenResponse) => void
            error_callback?: (err: { type?: string; message?: string }) => void
          }) => TokenClient
          revoke: (token: string, done?: () => void) => void
        }
      }
    }
  }
}

let gisPromise: Promise<void> | null = null

function loadGis(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Not in a browser'))
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (gisPromise) return gisPromise

  gisPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Could not reach Google')))
      return
    }
    const s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not reach Google. Check your connection.'))
    document.head.appendChild(s)
  })

  return gisPromise
}

/* ------------------------------------------------------------------ *
 * Token handling
 * ------------------------------------------------------------------ */

let token: string | null = null
let tokenExpiry = 0

export function hasLiveToken(): boolean {
  // Treat a token as dead a minute early so a long request cannot straddle expiry.
  return !!token && Date.now() < tokenExpiry - 60_000
}

export function forgetToken() {
  token = null
  tokenExpiry = 0
}

/**
 * @param interactive false attempts a silent refresh; true always shows the
 * account chooser. The first connect must be interactive.
 */
export async function getAccessToken(clientId: string, interactive: boolean): Promise<string> {
  if (hasLiveToken()) return token!
  if (!clientId) throw new Error('No Google client ID has been set.')

  await loadGis()
  const oauth2 = window.google?.accounts?.oauth2
  if (!oauth2) throw new Error('Google sign-in failed to load.')

  return new Promise<string>((resolve, reject) => {
    let settled = false
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp) => {
        if (settled) return
        settled = true
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error_description || resp.error || 'Google did not grant access.'))
          return
        }
        token = resp.access_token
        // GIS tokens last an hour; it does not report expiry on this path.
        tokenExpiry = Date.now() + 55 * 60_000
        resolve(resp.access_token)
      },
      error_callback: (err) => {
        if (settled) return
        settled = true
        reject(
          new Error(
            err.type === 'popup_closed'
              ? 'Sign-in window was closed.'
              : err.message || 'Google sign-in failed.',
          ),
        )
      },
    })

    client.requestAccessToken({ prompt: interactive ? 'consent' : '' })
  })
}

export async function revoke(clientId: string) {
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token)
  }
  void clientId
  forgetToken()
}

/* ------------------------------------------------------------------ *
 * Drive operations
 * ------------------------------------------------------------------ */

async function driveFetch(accessToken: string, url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers ?? {}) },
  })
  if (res.status === 401 || res.status === 403) {
    forgetToken()
    throw new Error('Google access expired. Connect again.')
  }
  if (!res.ok) {
    throw new Error(`Drive error ${res.status}: ${(await res.text()).slice(0, 140)}`)
  }
  return res
}

export interface RemoteFile {
  id: string
  modifiedTime: string
}

export async function findFile(accessToken: string): Promise<RemoteFile | null> {
  const url = new URL('https://www.googleapis.com/drive/v3/files')
  url.searchParams.set('spaces', 'appDataFolder')
  url.searchParams.set('fields', 'files(id,name,modifiedTime)')
  url.searchParams.set('q', `name = '${FILE_NAME}'`)
  url.searchParams.set('pageSize', '10')

  const res = await driveFetch(accessToken, url.toString())
  const data = (await res.json()) as { files?: { id: string; name: string; modifiedTime: string }[] }
  const hit = data.files?.find((f) => f.name === FILE_NAME)
  return hit ? { id: hit.id, modifiedTime: hit.modifiedTime } : null
}

export async function downloadFile(accessToken: string, fileId: string): Promise<string> {
  const res = await driveFetch(
    accessToken,
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
  )
  return res.text()
}

export async function uploadFile(
  accessToken: string,
  contents: string,
  fileId: string | null,
): Promise<RemoteFile> {
  const boundary = 'fos-boundary-8f4c1e'
  const metadata = fileId
    ? { name: FILE_NAME }
    : { name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' }

  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    `${contents}\r\n` +
    `--${boundary}--`

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id,modifiedTime`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime`

  const res = await driveFetch(accessToken, url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })

  const data = (await res.json()) as { id: string; modifiedTime: string }
  return { id: data.id, modifiedTime: data.modifiedTime }
}
