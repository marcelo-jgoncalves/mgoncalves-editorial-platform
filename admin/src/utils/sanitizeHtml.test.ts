// @vitest-environment jsdom
//
// DOMPurify needs a real DOM to parse/sanitize against - the project's
// global vitest environment is 'node' (admin/vitest.config.ts), which is why
// this file had no test at all before the Block 6 full audit
// (docs/book/cases/CASE-008): DOMPurify.sanitize() isn't callable without
// one. jsdom is already a real dependency here (bundled by vitest itself,
// confirmed via `npm ls jsdom`), so this per-file override needs no new
// package.json entry or lockfile change.
import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from './sanitizeHtml'

describe('sanitizeHtml', () => {
  it('strips script tags', () => {
    const result = sanitizeHtml('<p>Texto</p><script>alert(1)</script>')
    expect(result).not.toContain('<script>')
    expect(result).toContain('Texto')
  })

  it('strips javascript: URIs from href', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">clique</a>')
    expect(result).not.toContain('javascript:')
  })

  // Found during the Block 6 full audit (docs/book/cases/CASE-008): without
  // an explicit ALLOWED_URI_REGEXP, DOMPurify's default is more permissive
  // than backend/src/common/sanitizer.ts's ALLOWED_SCHEMES (http/https/mailto
  // only) - it also allows tel:/sms:/cid:/xmpp:, which this sanitizer's own
  // header comment claims should never happen ("must be identical").
  it('strips URI schemes the backend does not allow (tel:), keeping http/https/mailto', () => {
    const telResult = sanitizeHtml('<a href="tel:+5531999999999">ligar</a>')
    expect(telResult).not.toContain('tel:')

    const httpResult = sanitizeHtml('<a href="https://example.com">link</a>')
    expect(httpResult).toContain('https://example.com')

    const mailtoResult = sanitizeHtml('<a href="mailto:x@example.com">email</a>')
    expect(mailtoResult).toContain('mailto:x@example.com')
  })

  it('allows the Tiptap custom-node wrapper tags (div, span)', () => {
    const result = sanitizeHtml('<div class="callout"><span>conteúdo</span></div>')
    expect(result).toContain('<div')
    expect(result).toContain('<span>')
  })

  it('allows a YouTube iframe embed', () => {
    const result = sanitizeHtml('<iframe src="https://www.youtube.com/embed/x" data-youtube-video></iframe>')
    expect(result).toContain('<iframe')
  })

  it('returns an empty-safe value for empty input', () => {
    expect(sanitizeHtml('')).toBe('')
  })
})
