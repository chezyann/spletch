import { Fragment, useEffect, useState, type ReactNode } from 'react'
import type * as Y from 'yjs'
import { yXmlFragmentToProsemirrorJSON } from 'y-prosemirror'

type PMNode = { type?: string; attrs?: Record<string, unknown>; content?: PMNode[]; text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[] }

export function RichTextContent({ doc, field, className = '', fallbackText = '' }: { doc: Y.Doc; field: string; className?: string; fallbackText?: string }) {
  const fragment = doc.getXmlFragment(field)
  const [json, setJson] = useState<PMNode>(() => safeJson(fragment))
  useEffect(() => {
    const update = () => setJson(safeJson(fragment))
    fragment.observeDeep(update); update()
    return () => fragment.unobserveDeep(update)
  }, [fragment])
  const empty = !json.content?.length
  return <div className={`rich-text-content ${className}`}>{empty && fallbackText ? <p>{fallbackText}</p> : renderNode(json, 'root')}</div>
}
function safeJson(fragment: Y.XmlFragment): PMNode {
  try { return yXmlFragmentToProsemirrorJSON(fragment) as PMNode } catch { return { type: 'doc', content: [] } }
}
function renderNode(node: PMNode, key: string): ReactNode {
  if (node.type === 'text') return applyMarks(node.text ?? '', node.marks ?? [], key)
  const children = node.content?.map((child, index) => <Fragment key={`${key}.${index}`}>{renderNode(child, `${key}.${index}`)}</Fragment>) ?? null
  switch (node.type) {
    case 'doc': return children
    case 'paragraph': return <p>{children || <br />}</p>
    case 'heading': { const level = Math.min(4, Math.max(1, Number(node.attrs?.level ?? 2))); const Tag = `h${level}` as 'h1'; return <Tag>{children}</Tag> }
    case 'blockquote': return <blockquote>{children}</blockquote>
    case 'bulletList': return <ul>{children}</ul>
    case 'orderedList': return <ol start={Number(node.attrs?.start ?? 1)}>{children}</ol>
    case 'listItem': return <li>{children}</li>
    case 'taskList': return <ul className="task-list">{children}</ul>
    case 'taskItem': return <li className="task-item"><input type="checkbox" checked={Boolean(node.attrs?.checked)} readOnly />{children}</li>
    case 'codeBlock': return <pre data-language={String(node.attrs?.language ?? '')}><code>{children}</code></pre>
    case 'hardBreak': return <br />
    case 'horizontalRule': return <hr />
    case 'table': return <div className="rich-table-scroll"><table><tbody>{children}</tbody></table></div>
    case 'tableRow': return <tr>{children}</tr>
    case 'tableHeader': return <th>{children}</th>
    case 'tableCell': return <td>{children}</td>
    default: return children
  }
}
function applyMarks(text: string, marks: NonNullable<PMNode['marks']>, key: string): ReactNode {
  return marks.reduce<ReactNode>((content, mark, index) => {
    const markKey = `${key}.m${index}`
    switch (mark.type) {
      case 'bold': return <strong key={markKey}>{content}</strong>
      case 'italic': return <em key={markKey}>{content}</em>
      case 'underline': return <u key={markKey}>{content}</u>
      case 'strike': return <del key={markKey}>{content}</del>
      case 'code': return <code key={markKey}>{content}</code>
      case 'spoiler': return <span key={markKey} className="discord-spoiler" data-spoiler="true">{content}</span>
      case 'link': return <a key={markKey} href={safeHref(String(mark.attrs?.href ?? ''))} target="_blank" rel="noopener noreferrer nofollow">{content}</a>
      default: return content
    }
  }, text)
}
function safeHref(value: string): string { try { const url = new URL(value, location.origin); return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : '#' } catch { return '#' } }
