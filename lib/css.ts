/**
 * Escape a string for use as a CSS identifier (e.g. `section#<id>`).
 *
 * Same job as the browser's `CSS.escape`, but a plain function so it also runs
 * during server rendering. `CSS` doesn't exist in Node: SegmentOrderStyle and
 * SegmentColorStyle are client components that are ALSO rendered on the
 * server, so `CSS.escape` threw "CSS is not defined" there as soon as a saved
 * order or color existed, and the whole page fell back to client rendering.
 * Server and browser must produce the exact same string (it's inside a
 * <style> tag that hydrates), which is another reason not to branch on `CSS`.
 */
export function cssEscapeIdent(value: string): string {
  const chars = Array.from(value)
  return chars.map((ch, i) => {
    // An identifier can't start with a digit (or "-" + digit): escape it.
    const leadingDigit = /[0-9]/.test(ch) && (i === 0 || (i === 1 && chars[0] === '-'))
    if (!leadingDigit && /[a-zA-Z0-9_-]/.test(ch)) return ch
    return `\\${ch.codePointAt(0)!.toString(16)} `
  }).join('')
}

/** Escape a string for use inside a double-quoted CSS attribute value. */
export function cssEscapeString(value: string): string {
  return value.replace(/["\\\n\r]/g, ch => `\\${ch.codePointAt(0)!.toString(16)} `)
}
