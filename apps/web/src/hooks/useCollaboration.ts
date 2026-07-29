import { useEffect, useMemo, useState } from 'react'
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import { api, WS_URL } from '../lib/api'

export type CollaborationStatus = 'connecting' | 'connected' | 'disconnected'

export function useCollaboration(options: { boardId: string; guestName: string }) {
  const [status, setStatus] = useState<CollaborationStatus>('connecting')
  const doc = useMemo(() => new Y.Doc(), [options.boardId])
  const provider = useMemo(() => new HocuspocusProvider({
    url: WS_URL,
    name: `board.${options.boardId}`,
    document: doc,
    flushDelay: 120,
    forceSyncInterval: 10_000,
    token: async () => (await api<{ ticket: string }>(`/api/boards/${options.boardId}/realtime-ticket`, {
      method: 'POST', body: JSON.stringify({ guestName: options.guestName || undefined }),
    })).ticket,
  }), [doc, options.boardId, options.guestName])

  useEffect(() => {
    const onStatus = ({ status: next }: { status: string }) => setStatus(next === 'connected' ? 'connected' : next === 'disconnected' ? 'disconnected' : 'connecting')
    provider.on('status', onStatus)
    const renew = window.setInterval(() => provider.sendToken(), 45_000)
    return () => {
      window.clearInterval(renew)
      provider.off('status', onStatus)
      provider.destroy()
    }
  }, [doc, provider])
  useEffect(() => () => doc.destroy(), [doc])
  return { doc, provider, status }
}
