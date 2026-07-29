import { useEffect, useState } from 'react'
import { ArrowUpRight, LayoutDashboard, LogOut, Plus, Settings, Sparkles, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { api, type BoardSummary } from '../lib/api'

export function DashboardPage() {
  const { user, logout } = useAuth()
  const [boards, setBoards] = useState<BoardSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api<{ boards: BoardSummary[] }>('/api/boards')
      .then(result => setBoards(result.boards))
      .finally(() => setLoading(false))
  }, [] )

  async function createNewBoard() {
    setCreating(true)
    try {
      const result = await api<{ board: BoardSummary }>('/api/boards', {
        method: 'POST',
        body: JSON.stringify({ title: 'Nouveau tableau' }),
      })
      location.href = `/board/${result.board.id}`
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div className="brand-mark dark"><Sparkles size={20} /> Atelier</div>
        <div className="dashboard-user">
          <span className="avatar">{user?.username.slice(0, 2).toUpperCase()}</span>
          <div><strong>{user?.username}</strong><small>{user?.email}</small></div>
          <Link className="icon-button" to="/compte" title="Paramètres du compte"><Settings size={18} /></Link><button className="icon-button" onClick={() => logout()} title="Se déconnecter"><LogOut size={18} /></button>
        </div>
      </header>

      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Votre espace de travail</p>
          <h1>Bonjour {user?.username},<br />où allons-nous aujourd’hui&nbsp;?</h1>
        </div>
        <button className="button primary large" onClick={createNewBoard} disabled={creating}><Plus size={19} /> {creating ? 'Création…' : 'Nouveau tableau'}</button>
      </section>

      <section className="boards-section">
        <div className="section-title"><div><LayoutDashboard size={19} /><h2>Vos tableaux</h2></div><span>{boards.length}</span></div>
        {loading ? <div className="empty-card">Chargement des tableaux…</div> : boards.length === 0 ? (
          <button className="empty-board" onClick={createNewBoard}>
            <span className="empty-illustration"><Plus /></span>
            <strong>Créer le premier tableau</strong>
            <span>Commencez à réfléchir et invitez ensuite votre équipe.</span>
          </button>
        ) : (
          <div className="board-grid">
            {boards.map((board, index) => (
              <Link className={`board-card board-tone-${index % 4}`} to={`/board/${board.id}`} key={board.id}>
                <div className="board-card-top"><span className="role-pill">{board.role === 'owner' ? 'Propriétaire' : board.role === 'editor' ? 'Éditeur' : 'Lecture'}</span><ArrowUpRight size={19} /></div>
                <div className="mini-canvas" aria-hidden="true"><i /><i /><i /></div>
                <div><h3>{board.title}</h3><p><Users size={14} /> par {board.ownerUsername}</p></div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
