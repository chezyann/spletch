import { Extension, Mark, markInputRule, markPasteRule, mergeAttributes, textblockTypeInputRule } from '@tiptap/core'

export const Spoiler = Mark.create({
  name: 'spoiler',
  inclusive: false,
  parseHTML() { return [{ tag: 'span[data-spoiler="true"]' }] },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { class: 'discord-spoiler', 'data-spoiler': 'true' }), 0] },
  addInputRules() { return [markInputRule({ find: /(?:^|\s)((?:\|\|)([^|]+)(?:\|\|))$/, type: this.type })] },
  addPasteRules() { return [markPasteRule({ find: /(?:\|\|)([^|]+)(?:\|\|)/g, type: this.type })] },
})

export const DiscordInputRules = Extension.create({
  name: 'discordInputRules',
  addInputRules() {
    const underline = this.editor.schema.marks.underline
    const codeBlock = this.editor.schema.nodes.codeBlock
    return [
      ...(underline ? [markInputRule({ find: /(?:^|\s)((?:__)([^_]+)(?:__))$/, type: underline })] : []),
      ...(codeBlock ? [textblockTypeInputRule({ find: /^```([a-zA-Z0-9_+-]+)?\s$/, type: codeBlock, getAttributes: match => ({ language: match[1] || null }) })] : []),
    ]
  },
})
