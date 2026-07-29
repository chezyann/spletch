import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, FileText, MessageCircle, Share2, Sparkles, Users, Wifi, WifiOff, X } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useCollaboration } from '../hooks/useCollaboration'
import { api, type Role, type User } from '../lib/api'
import { BoardCanvas } from '../components/BoardCanvas'
import { ChatPanel, type ChatIdentity, type ChatMessage, type ChatReaction } from '../components/ChatPanel'
import { MarkdownPanel } from '../components/MarkdownPanel'
import { ShareModal } from '../components/ShareModal'
import { useSavedPanelWidth } from '../components/PanelResizeHandle'

type BoardAccess = {
  board: { id: string; title: string; ownerId: string; ownerUsername: string; schemaVersion: number }
  role: Role
  user: User | null
  mentionableUsers: { id: string; username: string }[]
  shareTokenConsumed?: boolean
}
type ActivePanel = 'chat' | 'markdown' | null
type PresenceState = { user?: ChatIdentity; role?: Role }

function identityColor(value: string) {
  const palette = ['#7c3aed', '#0f766e', '#c2410c', '#0369a1', '#be123c', '#4d7c0f', '#6d28d9']
  return palette[Math.abs([...value].reduce((acc, char) => acc + char.charCodeAt(0), 0)) % palette.length]
}

export function BoardPage() {
  const { boardId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const shareToken = searchParams.get('share')
  const { user } = useAuth()
  const [access, setAccess] = useState<BoardAccess | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const query = shareToken ? `?share=${encodeURIComponent(shareToken)}` : ''
    api<BoardAccess>(`/api/boards/${boardId}/access${query}`)
      .then(result => {
        if (cancelled) return
        setAccess(result)
        if (shareToken && result.shareTokenConsumed) history.replaceState({}, '', `/board/${boardId}`)
      })
      .catch(reason => !cancelled && setError(reason instanceof Error ? reason.message : 'Accès impossible.'))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [boardId, shareToken])

  if (loading) return <div className="center-screen"><div className="loader" /><p>Connexion au tableau…</p></div>
  if (!access) return <div className="access-denied"><div className="brand-mark dark"><Sparkles /> Atelier</div><h1>Tableau inaccessible</h1><p>{error}</p><Link className="button primary" to={user ? '/' : '/connexion'}>{user ? 'Retour aux tableaux' : 'Se connecter'}</Link></div>
  return <BoardWorkspace access={access} />
}

function BoardWorkspace({ access }: { access: BoardAccess }) {
  useSavedPanelWidth()
  const boardId = access.board.id
  const guestNameKey = `spletch.guestName.${boardId}`
  const [guestName, setGuestName] = useState(() => sessionStorage.getItem(guestNameKey) ?? '')
  const [askPseudonym, setAskPseudonym] = useState(false)
  const { doc, provider, status } = useCollaboration({ boardId, guestName })
  const [activePanel, setActivePanel] = useState<ActivePanel>(null)
  const activePanelRef = useRef<ActivePanel>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [mentionableUsers, setMentionableUsers] = useState(access.mentionableUsers)
  const [unread, setUnread] = useState(0)
  const [unreadMentions, setUnreadMentions] = useState(0)
  const [documentChanged, setDocumentChanged] = useState(false)
  const [participants, setParticipants] = useState<ChatIdentity[]>([])
  const [selfIdentity, setSelfIdentity] = useState<ChatIdentity>(() => access.user
    ? { id: access.user.id, type: 'user', username: access.user.username, color: identityColor(access.user.id) }
    : { id: 'visitor', type: 'guest', username: guestName || 'Visiteur', color: identityColor(boardId) })
  const [showParticipants, setShowParticipants] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [toast, setToast] = useState('')
  const [title, setTitle] = useState(access.board.title)
  const canEdit = access.role !== 'viewer'

  useEffect(() => { activePanelRef.current = activePanel }, [activePanel])
  useEffect(() => {
    if (activePanel === 'chat') { setUnread(0); setUnreadMentions(0) }
    if (activePanel === 'markdown') setDocumentChanged(false)
  }, [activePanel])

  useEffect(() => {
    const fragment = doc.getXmlFragment('projectNotes')
    const update = (_event: unknown, transaction: { local: boolean }) => {
      if (!transaction.local && activePanelRef.current !== 'markdown') setDocumentChanged(true)
    }
    fragment.observeDeep(update)
    return () => fragment.unobserveDeep(update)
  }, [doc])

  useEffect(() => {
    const awareness = provider.awareness
    if (!awareness) return
    const updateParticipants = () => {
      const states = awareness.getStates() as Map<number, PresenceState>
      const unique = new Map<string, ChatIdentity>()
      for (const state of states.values()) if (state.user) unique.set(state.user.id, state.user)
      setParticipants([...unique.values()])
      const mine = states.get(doc.clientID)?.user
      if (mine) setSelfIdentity(mine)
    }
    awareness.on('change', updateParticipants)
    updateParticipants()
    return () => { awareness.off('change', updateParticipants) }
  }, [doc.clientID, provider])

  useEffect(() => {
    const requestHistory = () => provider.sendStateless(JSON.stringify({ type: 'chat:history' }))
    const onStateless = ({ payload }: { payload: string }) => {
      let event: Record<string, unknown>
      try { event = JSON.parse(payload) as Record<string, unknown> } catch { return }
      if (event.type === 'chat:history') {
        setMessages(Array.isArray(event.messages) ? event.messages as ChatMessage[] : [])
        if (Array.isArray(event.mentionableUsers) && event.mentionableUsers.length) setMentionableUsers(event.mentionableUsers as { id: string; username: string }[])
      }
      if (event.type === 'chat:message' && event.message) {
        const message = event.message as ChatMessage
        setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message])
        if (message.author.id !== selfIdentity.id && activePanelRef.current !== 'chat') {
          setUnread(value => value + 1)
          if (access.user && message.mentions.some(name => name.toLocaleLowerCase('fr-FR') === access.user!.username.toLocaleLowerCase('fr-FR'))) setUnreadMentions(value => value + 1)
        }
      }
      if (event.type === 'chat:reaction' && typeof event.messageId === 'string' && Array.isArray(event.reactions)) {
        setMessages(current => current.map(message => message.id === event.messageId ? { ...message, reactions: event.reactions as ChatReaction[] } : message))
      }
      if (event.type === 'chat:error' && typeof event.message === 'string') {
        setToast(event.message); window.setTimeout(() => setToast(''), 3500)
      }
    }
    provider.on('authenticated', requestHistory)
    provider.on('stateless', onStateless)
    const timer = window.setTimeout(requestHistory, 500)
    return () => { window.clearTimeout(timer); provider.off('authenticated', requestHistory); provider.off('stateless', onStateless) }
  }, [access.user, provider, selfIdentity.id])

  function openChat() {
    if (!access.user && !guestName) { setAskPseudonym(true); return }
    setActivePanel(current => current === 'chat' ? null : 'chat')
  }
  async function saveTitle() {
    if (access.role !== 'owner' || title.trim() === access.board.title) return
    try {
      await api(`/api/boards/${boardId}`, { method: 'PATCH', body: JSON.stringify({ title: title.trim() }) })
      access.board.title = title.trim()
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : 'Le titre n’a pas été enregistré.'); setTitle(access.board.title)
    }
  }

  return <main className={`board-shell ${activePanel ? 'panel-open' : ''}`}>
    <header className="board-header">
      <div className="board-header-left"><Link to={access.user ? '/' : '/connexion'} className="icon-button header-back" aria-label="Retour"><ArrowLeft /></Link><div className="board-logo"><Sparkles size={17} /></div><input className="board-title" value={title} readOnly={access.role !== 'owner'} onChange={event => setTitle(event.target.value)} onBlur={saveTitle} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} aria-label="Nom du tableau" /><span className="role-pill header-role">{access.role === 'owner' ? 'Propriétaire' : access.role === 'editor' ? 'Édition' : 'Lecture seule'}</span></div>
      <div className="board-header-actions"><span className={`connection-pill ${status}`} title={status === 'connected' ? 'Synchronisé' : 'Connexion en cours'}>{status === 'connected' ? <Wifi size={15} /> : <WifiOff size={15} />}<span>{status === 'connected' ? 'En ligne' : 'Reconnexion'}</span></span><button className="participants-button" onClick={() => setShowParticipants(value => !value)}><span className="avatar-stack">{participants.slice(0, 3).map(person => <i key={person.id} style={{ background: person.color }}>{person.username.slice(0, 1).toUpperCase()}</i>)}</span><Users size={17} /><span>{participants.length}</span></button>{access.role === 'owner' && <button className="button secondary compact" onClick={() => setShowShare(true)}><Share2 size={17} /> <span>Partager</span></button>}</div>
    </header>
    <section className="board-stage"><BoardCanvas boardId={boardId} doc={doc} provider={provider} role={access.role} /></section>
    <nav className="right-actions" aria-label="Panneaux du projet"><button className={`panel-launcher ${activePanel === 'markdown' ? 'active' : ''} ${documentChanged ? 'has-update' : ''}`} onClick={() => setActivePanel(current => current === 'markdown' ? null : 'markdown')} title="Notes de projet"><FileText />{documentChanged && <span className="update-dot" />}</button><button className={`panel-launcher ${activePanel === 'chat' ? 'active' : ''} ${unreadMentions ? 'mention-alert' : unread ? 'has-update' : ''}`} onClick={openChat} title="Discussion"><MessageCircle />{unread > 0 && <span className="notification-badge">{unread > 99 ? '99+' : unread}</span>}{unreadMentions > 0 && <span className="mention-badge">@</span>}</button></nav>
    {activePanel === 'chat' && <ChatPanel provider={provider} messages={messages} identity={selfIdentity} currentUsername={access.user?.username} mentionableUsers={mentionableUsers} onClose={() => setActivePanel(null)} />}
    {activePanel === 'markdown' && <MarkdownPanel provider={provider} role={access.role} status={status} identity={selfIdentity} onClose={() => setActivePanel(null)} />}
    {showParticipants && <div className="participants-popover"><header><strong>Participants en ligne</strong><button className="icon-button" onClick={() => setShowParticipants(false)}><X size={16} /></button></header>{participants.map(person => <div key={person.id}><span className="presence-dot" style={{ background: person.color }} /><strong>{person.username}</strong>{person.type === 'guest' && <small>invité</small>}</div>)}</div>}
    {showShare && <ShareModal boardId={boardId} onClose={() => setShowShare(false)} />}
    {askPseudonym && <PseudonymModal initialValue={guestName} onCancel={() => setAskPseudonym(false)} onSubmit={value => { sessionStorage.setItem(guestNameKey, value); setGuestName(value); setAskPseudonym(false); setActivePanel('chat') }} />}
    {toast && <div className="toast">{toast}</div>}
  </main>
}

function PseudonymModal({ initialValue, onCancel, onSubmit }: { initialValue: string; onCancel: () => void; onSubmit: (value: string) => void }) {
  const [value, setValue] = useState(initialValue)
  function submit(event: FormEvent) { event.preventDefault(); const clean = value.normalize('NFKC').trim().slice(0, 30); if (clean.length >= 2) onSubmit(clean) }
  return <div className="modal-backdrop"><form className="modal pseudonym-modal" onSubmit={submit}><span className="panel-kicker">Participation au chat</span><h2>Comment devons-nous vous appeler&nbsp;?</h2><p>Votre pseudonyme sera clairement marqué comme invité.</p><input autoFocus minLength={2} maxLength={30} required value={value} onChange={event => setValue(event.target.value)} placeholder="Votre pseudonyme" /><div className="modal-actions"><button type="button" className="button secondary" onClick={onCancel}>Annuler</button><button className="button primary">Rejoindre le chat</button></div></form></div>
}
