import { useEffect } from 'react'
import { Bold, CheckSquare, ChevronRight, Code2, Heading2, Italic, Link2, List, Quote, Redo2, Table2, Strikethrough, Underline as UnderlineIcon, Undo2 } from 'lucide-react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { TableKit } from '@tiptap/extension-table'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { common, createLowlight } from 'lowlight'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import type { Role } from '../lib/api'
import type { CollaborationStatus } from '../hooks/useCollaboration'
import { DiscordInputRules, Spoiler } from '../editor/discordExtensions'
import { PanelResizeHandle } from './PanelResizeHandle'
import { isAllowedEditorUri, normalizedEditorHref, sanitizeEditorPaste } from '../editor/security'

const lowlight = createLowlight(common)
const defaultContent = `<h1>Synthèse du projet</h1><h2>Objectifs</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Définir les prochaines étapes</p></div></li></ul><h2>Décisions</h2><blockquote><p>Conservez ici les informations importantes du projet.</p></blockquote>`

export function MarkdownPanel({ provider, role, status, identity, onClose }: {
  provider: HocuspocusProvider
  role: Role
  status: CollaborationStatus
  identity: { username: string; color: string }
  onClose: () => void
}) {
  const canEdit = role !== 'viewer'
  const editor = useEditor({
    editable: canEdit,
    extensions: [
      StarterKit.configure({ undoRedo: false, codeBlock: false, link: false, underline: false }),
      Underline,
      Link.configure({ openOnClick: !canEdit, autolink: true, defaultProtocol: 'https', protocols: ['mailto'], isAllowedUri: (url, context) => context.defaultValidate(url) && isAllowedEditorUri(url), HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CodeBlockLowlight.configure({ lowlight }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder: 'Commencez la synthèse du projet…' }),
      Spoiler,
      DiscordInputRules,
      Collaboration.configure({ document: provider.document, field: 'projectNotes' }),
      CollaborationCaret.configure({ provider, user: { name: identity.username, color: identity.color } }),
    ],
    editorProps: {
      attributes: { class: 'project-notes-editor', spellcheck: 'true', 'aria-label': 'Notes de projet partagées' },
      transformPastedHTML: sanitizeEditorPaste,
    },
  }, [provider, canEdit, identity.username, identity.color])

  useEffect(() => {
    if (!editor) return
    const initialize = () => {
      if (canEdit && editor.isEmpty) editor.commands.setContent(defaultContent)
    }
    provider.on('synced', initialize)
    initialize()
    return () => { provider.off('synced', initialize) }
  }, [canEdit, editor, provider])

  return (
    <aside className="side-panel markdown-panel" aria-label="Notes de projet">
      <PanelResizeHandle />
      <header className="panel-header"><div><span className="panel-kicker">Document structuré partagé</span><h2>Notes de projet</h2></div><button className="icon-button" onClick={onClose} aria-label="Fermer l’éditeur"><ChevronRight /></button></header>
      {canEdit && editor && <div className="markdown-toolbar" role="toolbar" aria-label="Mise en forme">
        <button className={editor.isActive('heading', { level: 2 }) ? 'active' : ''} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Titre"><Heading2 /></button>
        <button className={editor.isActive('bold') ? 'active' : ''} onClick={() => editor.chain().focus().toggleBold().run()} title="Gras"><Bold /></button>
        <button className={editor.isActive('italic') ? 'active' : ''} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italique"><Italic /></button>
        <button className={editor.isActive('underline') ? 'active' : ''} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Souligné"><UnderlineIcon /></button>
        <button className={editor.isActive('strike') ? 'active' : ''} onClick={() => editor.chain().focus().toggleStrike().run()} title="Barré"><Strikethrough /></button>
        <button className={editor.isActive('bulletList') ? 'active' : ''} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Liste"><List /></button>
        <button className={editor.isActive('taskList') ? 'active' : ''} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Tâches"><CheckSquare /></button>
        <button className={editor.isActive('blockquote') ? 'active' : ''} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Citation"><Quote /></button>
        <button className={editor.isActive('codeBlock') ? 'active' : ''} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Bloc de code"><Code2 /></button>
        <button className={editor.isActive('table') ? 'active' : ''} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Tableau"><Table2 /></button>
        <button onClick={() => { const value = window.prompt('Adresse du lien (https://…)'); const href = safeEditorHref(value); if (href) editor.chain().focus().setLink({ href }).run() }} title="Lien"><Link2 /></button>
        <span className="toolbar-separator" />
        <button onClick={() => editor.chain().focus().undo().run()} title="Annuler"><Undo2 /></button>
        <button onClick={() => editor.chain().focus().redo().run()} title="Rétablir"><Redo2 /></button>
      </div>}
      <div className="project-notes-scroll"><EditorContent editor={editor} /></div>
      <footer className="panel-status"><span className={`status-dot ${status}`} /> {status === 'connected' ? 'Enregistré et synchronisé' : status === 'connecting' ? 'Synchronisation…' : 'Hors ligne — synchronisation en attente'}</footer>
    </aside>
  )
}

function safeEditorHref(value: string | null): string | null { return normalizedEditorHref(value) }
