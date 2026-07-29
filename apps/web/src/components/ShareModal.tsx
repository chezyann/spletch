import { useEffect, useState, type FormEvent } from 'react'
import { Check, Copy, Link2, Trash2, UserPlus, X } from 'lucide-react'
import { api } from '../lib/api'

type Member = { id: string; username: string; email: string; role: 'editor' | 'viewer' }
type ShareLink = { id: string; permission: 'editor' | 'viewer'; createdAt: string; expiresAt: string | null; lastUsedAt: string | null }

export function ShareModal({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const [members, setMembers] = useState<Member[]>([])
  const [links, setLinks] = useState<ShareLink[]>([])
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer'>('editor')
  const [newLink, setNewLink] = useState('')
  const [expiryDays, setExpiryDays] = useState(7)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const load = () => api<{ members: Member[]; links: ShareLink[] }>(`/api/boards/${boardId}/sharing`).then(result => { setMembers(result.members); setLinks(result.links) })
  useEffect(() => { void load() }, [boardId])

  async function invite(event: FormEvent) {
    event.preventDefault(); setError('')
    try { await api(`/api/boards/${boardId}/members`, { method: 'POST', body: JSON.stringify({ username, role }) }); setUsername(''); await load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Invitation impossible.') }
  }
  async function createLink(permission: 'editor' | 'viewer') {
    const expiresAt = expiryDays > 0 ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString() : null
    const result = await api<{ link: ShareLink & { token: string } }>(`/api/boards/${boardId}/share-links`, { method: 'POST', body: JSON.stringify({ permission, expiresAt }) })
    const url = `${location.origin}/board/${boardId}?share=${result.link.token}`
    setNewLink(url); setCopied(false)
    await load()
  }

  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="modal share-modal" role="dialog" aria-modal="true" aria-label="Partager le tableau">
      <header><div><span className="panel-kicker">Accès au projet</span><h2>Partager le tableau</h2></div><button className="icon-button" onClick={onClose}><X /></button></header>
      <div className="modal-section"><h3><UserPlus size={18} /> Inviter un utilisateur</h3><form className="invite-row" onSubmit={invite}><input value={username} onChange={event => setUsername(event.target.value)} placeholder="Nom d’utilisateur" required /><select value={role} onChange={event => setRole(event.target.value as 'editor' | 'viewer')}><option value="editor">Peut modifier</option><option value="viewer">Lecture seule</option></select><button className="button primary">Inviter</button></form>{error && <div className="form-error">{error}</div>}<div className="member-list">{members.map(member => <div key={member.id}><span className="avatar small">{member.username.slice(0, 2).toUpperCase()}</span><div><strong>{member.username}</strong><small>{member.email}</small></div><span className="role-pill">{member.role === 'editor' ? 'Éditeur' : 'Lecture'}</span><button className="icon-button danger" onClick={async () => { await api(`/api/boards/${boardId}/members/${member.id}`, { method: 'DELETE' }); await load() }}><Trash2 size={16} /></button></div>)}{members.length === 0 && <p className="muted">Aucun utilisateur invité.</p>}</div></div>
      <div className="modal-section"><h3><Link2 size={18} /> Partager avec un lien</h3><label>Expiration<select value={expiryDays} onChange={event => setExpiryDays(Number(event.target.value))}><option value={1}>1 jour</option><option value={7}>7 jours</option><option value={30}>30 jours</option><option value={0}>Sans expiration</option></select></label><div className="link-actions"><button className="button secondary" onClick={() => createLink('viewer')}>Lien de lecture</button><button className="button secondary" onClick={() => createLink('editor')}>Lien d’édition</button></div>{newLink && <div className="generated-link"><input readOnly value={newLink} /><button className="icon-button" onClick={async () => { await navigator.clipboard.writeText(newLink); setCopied(true) }}>{copied ? <Check /> : <Copy />}</button></div>}<div className="link-list">{links.map(link => <div key={link.id}><span><Link2 size={15} /> Lien {link.permission === 'editor' ? 'd’édition' : 'de lecture'}</span><small>{link.expiresAt ? `Expire le ${new Intl.DateTimeFormat('fr-FR').format(new Date(link.expiresAt))}` : 'Sans expiration'}{link.lastUsedAt ? ` · utilisé le ${new Intl.DateTimeFormat('fr-FR').format(new Date(link.lastUsedAt))}` : ''}</small><button className="icon-button danger" onClick={async () => { await api(`/api/boards/${boardId}/share-links/${link.id}`, { method: 'DELETE' }); await load() }}><Trash2 size={16} /></button></div>)}</div></div>
    </section>
  </div>
}
