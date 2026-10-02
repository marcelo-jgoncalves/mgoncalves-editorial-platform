import Link from '@tiptap/extension-link'
import StarterKit from '@tiptap/starter-kit'
import BubbleMenuExtension from '@tiptap/extension-bubble-menu'
import FloatingMenuExtension from '@tiptap/extension-floating-menu'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Youtube from '@tiptap/extension-youtube'
import Code from '@tiptap/extension-code'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'
import hljs from 'highlight.js'
import { Callout } from '../components/Callout'
import { PullQuote } from '../components/tiptap/PullQuote'
import { ClosingFlourish } from '../components/tiptap/ClosingFlourish'
import { SmartImage } from '../components/tiptap/SmartImage'
import { SlashCommand } from '../components/tiptap/SlashCommand'

// Prevents paragraphs (<p>) inside table cells (TD)
const CustomTableCell = TableCell.extend({
  content: 'inline*',
})

// Prevents paragraphs (<p>) inside table headers (TH)
const CustomTableHeader = TableHeader.extend({
  content: 'inline*',
})

// Languages chosen for the Tech/DevOps/AI niche this blog covers
function buildLowlightInstance() {
  const lowlightInstance = createLowlight(common)
  const languages: [string, string][] = [
    ['terraform', 'terraform'],
    ['javascript', 'javascript'],
    ['typescript', 'typescript'],
    ['bash', 'bash'],
    ['python', 'python'],
    ['yaml', 'yaml'],
    ['json', 'json'],
    ['sql', 'sql'],
  ]
  for (const [hljsName, lowlightName] of languages) {
    const def = hljs.getLanguage(hljsName)?.rawDefinition
    if (def) lowlightInstance.register(lowlightName, def)
  }
  return lowlightInstance
}

export function buildTiptapExtensions(onRequestImage: () => void) {
  return [
    BubbleMenuExtension,
    FloatingMenuExtension,
    StarterKit.configure({
      code: false,
      heading: { levels: [2, 3] },
      codeBlock: false,
      link: false,
      blockquote: {},
      horizontalRule: {
        HTMLAttributes: {
          style: 'border: none; border-top: 1px solid #e0e0e0; margin: 2rem 0; height: 0; background: transparent;',
        },
      },
    }),
    Table.configure({
      resizable: true,
      HTMLAttributes: {
        class: 'my-custom-table',
      },
    }),
    TableRow,
    CustomTableHeader,
    CustomTableCell,
    Youtube.configure({
      controls: true,
      nocookie: true,
      // Responsive sizing via CSS is preferable, but a default is set here
      width: 640,
      height: 360,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: {
        class: 'content-link',
        rel: 'noopener noreferrer',
        target: '_blank',
      },
    }),
    CodeBlockLowlight.configure({
      lowlight: buildLowlightInstance(),
      defaultLanguage: 'python',
    }),
    Callout,
    PullQuote,
    ClosingFlourish,
    SmartImage.configure({
      inline: false,
      // allowBase64 was true: Tiptap's native paste/drop handler embeds a
      // pasted screenshot or dropped file as a data: URI directly, bypassing
      // mediaApi's presigned-upload flow entirely. Confirmed real and silent:
      // backend/src/common/sanitizer.ts's ALLOWED_SCHEMES (http/https/mailto
      // only) strips a data: img src on save, leaving an <img> with no src -
      // a broken image on the published post, with zero error shown to the
      // admin. Found during the Block 6 full audit (docs/book/cases/
      // CASE-008) by testing the real sanitize-html call, not assuming.
      // false forces every image through the real upload pipeline
      // (mediaUpload presigned POST -> S3 -> imageProcessor variants), which
      // is also what keeps conteudo_html under its 300_000-char schema limit
      // (packages/contracts/src/post.ts) - a base64 screenshot alone can
      // approach or exceed that on its own.
      allowBase64: false,
    }),
    Code.configure({
      HTMLAttributes: {
        class: 'inline-code',
      },
    }),
    SlashCommand.configure({
      onRequestImage,
    }),
  ]
}

export const CODE_LANGUAGES = [
  { value: 'python', label: 'Python' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'bash', label: 'Bash' },
  { value: 'terraform', label: 'Terraform' },
  { value: 'yaml', label: 'YAML' },
  { value: 'json', label: 'JSON' },
  { value: 'sql', label: 'SQL' },
]
