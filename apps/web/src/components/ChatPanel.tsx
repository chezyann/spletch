import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ChevronRight, Send, Smile, X } from 'lucide-react'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { PanelResizeHandle } from './PanelResizeHandle'
import { MarkdownContent } from '../security/MarkdownContent'

export type ChatIdentity = { id: string; type: 'user' | 'guest'; username: string; color: string }
export type ChatReaction = { emoji: string; participantIds: string[]; participantNames: string[] }
export type ChatMessage = { id: string; markdown: string; author: ChatIdentity; createdAt: number; mentions: string[]; reactions: ChatReaction[] }
const quickEmojis = ['👍', '❤️', '🎉', '👀', '✅', '🤔']

export function ChatPanel({ provider, messages, identity, currentUsername, mentionableUsers, onClose }: {
  provider: HocuspocusProvider; messages: ChatMessage[]; identity: ChatIdentity; currentUsername?: string
  mentionableUsers: { id: string; username: string }[]; onClose: () => void
}) {
  const [draft, setDraft] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }) }, [messages])
  const mentionQuery = useMemo(() => draft.match(/(?:^|\s)@([\p{L}\p{N}_-]*)$/u)?.[1].toLocaleLowerCase('fr-FR') ?? null, [draft])
  const suggestions = mentionQuery === null ? [] : mentionableUsers.filter(user => user.username.toLocaleLowerCase('fr-FR').includes(mentionQuery)).slice(0, 6)
  function addMention(username: string) { setDraft(value => value.replace(/@([\p{L}\p{N}_-]*)$/u, `@${username} `)); requestAnimationFrame(() => textareaRef.current?.focus()) }
  function send(event?: FormEvent) {
    event?.preventDefault()
    const markdown = draft.trim()
    if (!markdown) return
    provider.sendStateless(JSON.stringify({ type: 'chat:message', markdown }))
    setDraft(''); setShowEmoji(false); setError('')
  }
  function react(messageId: string, emoji: string) { provider.sendStateless(JSON.stringify({ type: 'chat:reaction', messageId, emoji })) }

  return <aside className="side-panel chat-panel" aria-label="Discussion du projet">
    <PanelResizeHandle />
    <header className="panel-header"><div><span className="panel-kicker">En direct · éphémère</span><h2>Discussion</h2></div><button className="icon-button" onClick={onClose} aria-label="Réduire le chat"><ChevronRight /></button></header>
    <div className="chat-stream" ref={scrollRef}>
      {messages.length === 0 && <div className="chat-empty"><span>💬</span><strong>La conversation commence ici.</strong><p>Le chat disparaît après l’inactivité de la salle.</p></div>}
      {messages.map(message => {
        const isMine = message.author.id === identity.id
        const mentioned = Boolean(currentUsername && message.mentions.some(name => name.toLocaleLowerCase('fr-FR') === currentUsername.toLocaleLowerCase('fr-FR')))
        return <article key={message.id} className={`chat-message ${isMine ? 'mine' : ''} ${mentioned ? 'mentioned' : ''}`}>
          <div className="message-meta"><span className="presence-dot" style={{ background: message.author.color }} /><strong>{message.author.username}</strong>{message.author.type === 'guest' && <small>invité</small>}<time>{new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(message.createdAt)}</time></div>
          <MarkdownContent source={message.markdown} />
          <div className="message-reactions">
            {message.reactions.map(reaction => <button key={reaction.emoji} className={reaction.participantIds.includes(identity.id) ? 'active' : ''} onClick={() => react(message.id, reaction.emoji)} title={reaction.participantNames.join(', ')}>{reaction.emoji} <span>{reaction.participantIds.length}</span></button>)}
            <div className="reaction-add"><button title="Ajouter une réaction" aria-label="Ajouter une réaction">＋</button><div className="reaction-menu">{quickEmojis.map(emoji => <button key={emoji} onClick={() => react(message.id, emoji)}>{emoji}</button>)}</div></div>
          </div>
        </article>
      })}
    </div>
    <form className="chat-composer" onSubmit={send}>
      {suggestions.length > 0 && <div className="mention-suggestions">{suggestions.map(user => <button type="button" key={user.id} onClick={() => addMention(user.username)}>@{user.username}</button>)}</div>}
      {error && <div className="composer-error">{error}<button onClick={() => setError('')} type="button"><X size={14} /></button></div>}
      <textarea ref={textareaRef} value={draft} onChange={event => setDraft(event.target.value.slice(0, 4000))} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() } }} placeholder="Écrire avec le Markdown Discord…" aria-label="Nouveau message" rows={3} />
      <div className="composer-actions"><div className="emoji-control"><button type="button" className="icon-button" onClick={() => setShowEmoji(value => !value)} aria-label="Ajouter un emoji"><Smile size={19} /></button>{showEmoji && <div className="emoji-popover">{quickEmojis.map(emoji => <button key={emoji} type="button" onClick={() => setDraft(value => `${value}${emoji}`)}>{emoji}</button>)}</div>}</div><span>{draft.length}/4000</span><button className="send-button" disabled={!draft.trim()} aria-label="Envoyer"><Send size={18} /></button></div>
    </form>
  </aside>
}
