// Reads JSX opening tags by walking them (strings, template strings, nested braces and arrow functions), because
// a pattern gives up on deep props such as a modal's footer. Used by check_old_ui.mjs and its test.

/** The attribute text of the JSX tag whose name ends at `from`, or null when it never closes. */
function tagAttrs(text, from) {
  let depth = 0
  let quote = ''
  for (let i = from; i < text.length; i += 1) {
    const c = text[i]
    if (quote) {
      if (c === '\\') i += 1
      else if (c === quote) quote = ''
      continue
    }
    if (c === '"' || c === "'" || c === '`') quote = c
    else if (c === '{') depth += 1
    else if (c === '}') depth -= 1
    else if (c === '>' && depth === 0 && text[i - 1] !== '=') return text.slice(from, i)
  }
  return null
}

/** Top-level attribute names of a tag: props inside {...} (a footer's buttons) do not count. */
function attrNames(attrs) {
  let depth = 0
  let quote = ''
  let flat = ''
  for (let i = 0; i < attrs.length; i += 1) {
    const c = attrs[i]
    if (quote) {
      if (c === '\\') i += 1
      else if (c === quote) quote = ''
      continue
    }
    if (depth === 0 && (c === '"' || c === "'")) quote = c
    else if (c === '{') depth += 1
    else if (c === '}') depth -= 1
    else if (depth === 0) flat += c
  }
  return new Set(flat.match(/[A-Za-z_][\w-]*/g) ?? [])
}

const OVERLAY = /<(Modal|Popover|Drawer|ConfirmDialog|[A-Z]\w*(?:Modal|Dialog|Drawer|Wizard))(?=[\s/>])/g

/**
 * Overlays that would not open out of the control that was used (ceda-genie-motion).
 * Every <Modal needs triggerRef. Other overlays with an `open` prop need triggerRef, or routeOpened when nothing
 * is clicked to open them.
 */
export function untriggeredOverlays(text) {
  const out = []
  for (const m of text.matchAll(OVERLAY)) {
    const attrs = tagAttrs(text, m.index + m[0].length)
    if (attrs === null) continue
    const names = attrNames(attrs)
    if (names.has('triggerRef')) continue
    const isModal = m[1] === 'Modal'
    if (!isModal && (!names.has('open') || names.has('routeOpened'))) continue
    out.push({ line: text.slice(0, m.index).split('\n').length, name: m[1] })
  }
  return out
}
