import { useEffect, useState } from 'react'
import { ArrowLeft, Laptop, LogOut, ShieldCheck, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../hooks/useAuth'

type Session = { id: string; expiresAt: string; createdAt: string; lastSeenAt: string | null; userAgent: string | null; ipPrefix: string | null }

export function AccountPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentSessionId, setCurrentSessionId] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')

  async function loadSessions() {
    const result = await api<{ sessions: Session[]; currentSessionId: string }>('/api/auth/sessions')
    setSessions(result.sessions); setCurrentSessionId(result.currentSessionId)
  }
  useEffect(() => { void loadSessions() }, [])

  async function revoke(sessionId: string) {
    await api(`/api/auth/sessions/${sessionId}`, { method: 'DELETE' })
    if (sessionId === currentSessionId) { await logout(); navigate('/connexion'); return }
    await loadSessions(); setMessage('Session révoquée.')
  }
  async function revokeOthers() {
    await api('/api/auth/revoke-others', { method: 'POST' })
    await loadSessions(); setMessage('Toutes les autres sessions ont été révoquées.')
  }
  async function removeAccount() {
    if (confirmation !== 'SUPPRIMER') return
    await api('/api/account', { method: 'DELETE', body: JSON.stringify({ confirmation }) })
    await logout().catch(() => undefined)
    navigate('/connexion')
  }

  return <main className="account-shell">
    <header className="account-header"><Link className="icon-button" to="/" aria-label="Retour"><ArrowLeft /></Link><div><span className="panel-kicker">Sécurité du compte</span><h1>Compte et sessions</h1></div></header>
    <section className="account-card"><div className="account-identity"><span className="avatar">{user?.username.slice(0, 2).toUpperCase()}</span><div><strong>{user?.username}</strong><small>{user?.email}</small></div></div></section>
    <section className="account-card"><div className="account-section-title"><div><ShieldCheck /><div><h2>Sessions actives</h2><p>Révoquez les appareils que vous ne reconnaissez pas.</p></div></div><button className="button secondary" onClick={revokeOthers}>Déconnecter les autres</button></div>
      <div className="session-list">{sessions.map(session => <article key={session.id} className={session.id === currentSessionId ? 'current' : ''}><Laptop /><div><strong>{session.id === currentSessionId ? 'Cet appareil' : session.userAgent || 'Appareil inconnu'}</strong><small>{session.ipPrefix || 'Adresse non disponible'} · dernière activité {formatDate(session.lastSeenAt || session.createdAt)} · expiration {formatDate(session.expiresAt)}</small></div><button className="icon-button danger" onClick={() => revoke(session.id)} title="Révoquer la session"><LogOut /></button></article>)}</div>
      {message && <p className="success-message" role="status">{message}</p>}
    </section>
    <section className="account-card danger-zone"><div><h2>Supprimer le compte</h2><p>Les tableaux possédés seront placés en suppression différée, puis les fichiers seront purgés selon la durée de rétention configurée.</p></div><label>Tapez <strong>SUPPRIMER</strong><input value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label><button className="button danger" disabled={confirmation !== 'SUPPRIMER'} onClick={removeAccount}><Trash2 /> Supprimer définitivement</button></section>
  </main>
}
function formatDate(value: string) { return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
