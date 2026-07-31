import { financialState, type FinancialState } from '@/lib/types'
import { localUpdatedAt, readSyncMeta, writeSyncMeta } from '@/lib/storage'
import { downloadFile, findFile, getAccessToken, hasLiveToken, revoke, uploadFile } from './drive'
import { deviceLabel, mergeStates, type MergeSummary, type SyncEnvelope } from './merge'

export type { MergeSummary }
export { deviceLabel }

export interface SyncResult {
  state: FinancialState
  summary: MergeSummary | null
  syncedAt: string
  message: string
}

function envelope(state: FinancialState): SyncEnvelope {
  return {
    version: 1,
    updatedAt: localUpdatedAt() || new Date().toISOString(),
    device: deviceLabel(),
    state,
  }
}

function parseEnvelope(raw: string): { state: FinancialState; updatedAt: string; device: string } | null {
  try {
    const data = JSON.parse(raw) as Partial<SyncEnvelope> & Partial<FinancialState>
    // Accept a bare state too, in case a file was written by an export.
    const candidate = data.state ?? (data as FinancialState)
    const parsed = financialState.safeParse(candidate)
    if (!parsed.success) return null
    return {
      state: parsed.data,
      updatedAt: data.updatedAt ?? '',
      device: data.device ?? 'another device',
    }
  } catch {
    return null
  }
}

/**
 * Pull, merge, push — in that order, always.
 *
 * Pushing first would mean a device that had been offline overwrites whatever
 * the other one did in the meantime. Merging before writing is what makes it
 * safe to use both devices without thinking about which is authoritative.
 */
export async function syncNow(
  local: FinancialState,
  opts: { interactive?: boolean } = {},
): Promise<SyncResult> {
  const meta = readSyncMeta()
  if (!meta.clientId) throw new Error('Add your Google client ID first.')

  const token = await getAccessToken(meta.clientId, opts.interactive ?? false)

  const remoteFile = await findFile(token)
  let merged = local
  let summary: MergeSummary | null = null
  let message = 'Backed up to Drive.'

  if (remoteFile) {
    const raw = await downloadFile(token, remoteFile.id)
    const parsed = parseEnvelope(raw)
    if (parsed) {
      const result = mergeStates(local, localUpdatedAt(), parsed.state, parsed.updatedAt)
      merged = result.merged
      summary = result.summary
      message =
        result.summary.added || result.summary.removed
          ? `Merged — ${result.summary.added} brought in, ${result.summary.removed} removed.`
          : 'Already up to date.'
    } else {
      message = 'The file in Drive was unreadable, so this device replaced it.'
    }
  } else {
    message = 'First backup created in Drive.'
  }

  const written = await uploadFile(token, JSON.stringify(envelope(merged)), remoteFile?.id ?? null)
  const syncedAt = new Date().toISOString()

  writeSyncMeta({ connected: true, fileId: written.id, lastSyncedAt: syncedAt, lastError: null })

  return { state: merged, summary, syncedAt, message }
}

export async function connect(clientId: string, local: FinancialState): Promise<SyncResult> {
  writeSyncMeta({ clientId: clientId.trim() })
  return syncNow(local, { interactive: true })
}

export async function disconnect() {
  const meta = readSyncMeta()
  await revoke(meta.clientId)
  writeSyncMeta({ connected: false, fileId: null, lastSyncedAt: null, lastError: null })
}

/** True when a silent background sync is worth attempting. */
export function canSyncQuietly(): boolean {
  const meta = readSyncMeta()
  return meta.connected && !!meta.clientId && hasLiveToken()
}

export { readSyncMeta, writeSyncMeta }
