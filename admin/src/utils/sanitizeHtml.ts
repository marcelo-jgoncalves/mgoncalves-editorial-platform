import DOMPurify from 'dompurify'

// div/span: wrapper for Tiptap's custom nodes (Callout, PullQuote,
// ClosingFlourish, YouTube embed). Without them DOMPurify "unwraps" those
// nodes, discarding the div and leaving only loose text in the saved HTML.
// Kept in sync with backend/src/common/sanitizer.ts: ALLOWED_TAGS and
// ALLOWED_ATTR must be identical between admin (DOMPurify) and backend (sanitize-html).
const ALLOWED_TAGS = [
  // Block
  'h1','h2','h3','h4','h5','h6',
  'p','blockquote','pre','hr','br',
  'ul','ol','li',
  'div','table','thead','tbody','tr','th','td',
  // Inline
  'strong','em','u','s','code',
  'a','img','span','mark',
  'iframe', // YouTube embeds
]
const ALLOWED_ATTR = [
  'src','alt','href','title','class','id','target','rel','width','height',
  'loading', // img
  'frameborder','allow','allowfullscreen','data-youtube-video', // iframe
  'colspan','rowspan', // th, td
]

// Matches backend/src/common/sanitizer.ts's ALLOWED_SCHEMES exactly. Without
// this, DOMPurify falls back to its own default URI regex, which is more
// permissive (also allows tel:/sms:/cid:/xmpp:) than the backend - found
// during the Block 6 full audit (docs/book/cases/CASE-008) while verifying
// the header comment's "must be identical" claim directly instead of
// trusting it. Low severity in practice: this sanitizer only feeds the local
// preview overlay (PostPreviewOverlay.vue) - the backend's own sanitizePostHtml()
// is the real, authoritative pass applied before anything is persisted or
// served to a real visitor - but the preview should still reflect the same
// rules, not a looser approximation of them.
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOWED_URI_REGEXP })
}
