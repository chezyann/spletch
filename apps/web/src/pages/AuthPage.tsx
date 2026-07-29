import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      if (mode === 'register') await auth.register(email, username, password)
      else await auth.login(login, password)
      navigate('/')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Une erreur est survenue.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-story">
        <div className="brand-mark"><Sparkles size={22} /> Atelier</div>
        <div>
          <p className="eyebrow">Clarifier ensemble</p>
          <h1>Un espace vivant pour penser, décider et documenter.</h1>
          <p>Tableau blanc, synthèse Markdown et échanges en direct réunis dans un même projet.</p>
        </div>
        <div className="auth-orbit" aria-hidden="true">
          <span>Idées</span><span>Décisions</span><span>Projet</span>
        </div>
      </section>
      <section className="auth-panel">
        <form className="auth-card" onSubmit={submit}>
          <div>
            <p className="eyebrow">{mode === 'login' ? 'Bon retour' : 'Créer votre espace'}</p>
            <h2>{mode === 'login' ? 'Se connecter' : 'Créer un compte'}</h2>
          </div>
          {mode === 'register' ? (
            <>
              <label>Email<input type="email" required value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" /></label>
              <label>Nom d’utilisateur<input required minLength={2} maxLength={30} value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" placeholder="camille" /></label>
            </>
          ) : (
            <label>Email ou nom d’utilisateur<input required value={login} onChange={event => setLogin(event.target.value)} autoComplete="username" /></label>
          )}
          <label>Mot de passe<input type="password" required minLength={12} value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="button primary large" disabled={submitting}>{submitting ? 'Chargement…' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}</button>
          <p className="auth-switch">
            {mode === 'login' ? 'Pas encore de compte ? ' : 'Déjà un compte ? '}
            <Link to={mode === 'login' ? '/inscription' : '/connexion'}>{mode === 'login' ? 'S’inscrire' : 'Se connecter'}</Link>
          </p>
        </form>
      </section>
    </main>
  )
}
