import { useEffect, type CSSProperties } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import Collaboration from '@tiptap/extension-collaboration'
import Placeholder from '@tiptap/extension-placeholder'
import type * as Y from 'yjs'
import { baseEditorExtensions } from './baseExtensions'
import { sanitizeEditorPaste } from './security'

export function CanvasTextEditor({ doc, field, style, initialText, onClose }: {
  doc: Y.Doc; field: string; initialText?: string; style: CSSProperties; onClose: () => void
}) {
  const editor = useEditor({
    autofocus: 'end',
    extensions: [...baseEditorExtensions(), Placeholder.configure({ placeholder: 'Saisissez votre texte…' }), Collaboration.configure({ document: doc, field })],
    editorProps: {
      attributes: { class: 'canvas-text-editor-content', spellcheck: 'true' },
      transformPastedHTML: sanitizeEditorPaste,
      handleKeyDown: (_view, event) => { if (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key === 'Enter')) { onClose(); return true } return false },
    },
  }, [doc, field])
  useEffect(() => {
    if (!editor || !initialText || !editor.isEmpty) return
    editor.commands.setContent(`<p>${escapeHtml(initialText)}</p>`)
  }, [editor, initialText])
  return <div className="canvas-text-editor" style={style} onMouseDown={event => event.stopPropagation()} onTouchStart={event => event.stopPropagation()}><EditorContent editor={editor} /></div>
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!) }
