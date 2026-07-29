import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { TableKit } from '@tiptap/extension-table'
import { common, createLowlight } from 'lowlight'
import { DiscordInputRules, Spoiler } from './discordExtensions'
import { isAllowedEditorUri } from './security'

const lowlight = createLowlight(common)
export function baseEditorExtensions() {
  return [
    StarterKit.configure({ undoRedo: false, codeBlock: false, link: false, underline: false }),
    Underline,
    Link.configure({ openOnClick: false, autolink: true, defaultProtocol: 'https', protocols: ['mailto'], isAllowedUri: (url, context) => context.defaultValidate(url) && isAllowedEditorUri(url), HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    CodeBlockLowlight.configure({ lowlight }),
    TableKit.configure({ table: { resizable: false } }),
    Spoiler,
    DiscordInputRules,
  ]
}
