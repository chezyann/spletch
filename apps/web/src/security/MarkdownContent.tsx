import { useMemo, type MouseEvent } from 'react'
import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'

const marker = {
  uOpen: 'SPLETCHUNDERLINEOPEN', uClose: 'SPLETCHUNDERLINECLOSE',
  spoilerOpen: 'SPLETCHSPOILEROPEN', spoilerClose: 'SPLETCHSPOILERCLOSE',
}

function discordPreprocess(source: string): string {
  const parts = source.split(/(```[\s\S]*?```|`[^`\n]*`)/g)
  return parts.map(part => {
    if (part.startsWith('`')) return part
    return part
      .replace(/__([\s\S]+?)__/g, `${marker.uOpen}$1${marker.uClose}`)
      .replace(/\|\|([\s\S]+?)\|\|/g, `${marker.spoilerOpen}$1${marker.spoilerClose}`)
  }).join('')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
  highlight(code: string, language: string): string {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value
    }
    return escapeHtml(code)
  },
})
const linkOpenRule: NonNullable<typeof markdown.renderer.rules.link_open> = (tokens, index, options, _env, self) => {
  tokens[index].attrSet('target', '_blank')
  tokens[index].attrSet('rel', 'noopener noreferrer nofollow')
  return self.renderToken(tokens, index, options)
}
markdown.renderer.rules.link_open = linkOpenRule

function renderSafe(source: string): string {
  const rendered = markdown.render(discordPreprocess(source))
    .replaceAll(marker.uOpen, '<u>')
    .replaceAll(marker.uClose, '</u>')
    .replaceAll(marker.spoilerOpen, '<span class="discord-spoiler" data-spoiler="true">')
    .replaceAll(marker.spoilerClose, '</span>')
  return DOMPurify.sanitize(rendered, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'del', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'input'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'data-spoiler', 'type', 'checked', 'disabled'],
    ALLOW_DATA_ATTR: true,
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'svg', 'math'],
    FORBID_ATTR: ['style', 'onerror', 'onclick', 'onload'],
  })
}

export function MarkdownContent({ source, className = '' }: { source: string; className?: string }) {
  const html = useMemo(() => renderSafe(source), [source])
  function reveal(event: MouseEvent<HTMLDivElement>) {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-spoiler="true"]')
    if (target) target.classList.toggle('revealed')
  }
  return <div className={`markdown-body ${className}`} onClick={reveal} dangerouslySetInnerHTML={{ __html: html }} />
}
