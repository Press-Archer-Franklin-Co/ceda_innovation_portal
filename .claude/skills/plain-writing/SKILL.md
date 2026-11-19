---
name: plain-writing
description: "Read before writing any text in this repository: UI strings (English or Setswana), error messages, comments, docstrings, commit messages, pull request descriptions, markdown or skills. Bans the em dash and sets the plain, friendly CEDA voice."
---

# Plain writing

## No em dashes

The em dash (U+2014) is not used anywhere in this repository: not in UI text,
comments, docs, commits or skills. It lets a sentence avoid deciding what it
means. Pick the real punctuation:

| The dash was doing | Use instead |
|---|---|
| adding an aside | commas, or brackets |
| introducing a list or an explanation | a colon |
| joining two full thoughts | a full stop, or a semicolon |
| showing a range (9–17) | an en dash is fine for number ranges, or write "9 to 17" |
| an empty table cell | the shared `EMPTY_CELL` constant in `src/lib/format` (renders "Not known" for screen readers) |

Check before committing:

```bash
git grep -n $'\xe2\x80\x94' -- . ':!**/node_modules/**' ':!**/dist/**' && echo "Em dash found" && exit 1 || true
```

CI runs the same check (add it to `.github/workflows/ci.yml`).

## The CEDA voice

- Short sentences. Active voice. Say who does what: "We will reply within 5
  working days", not "A response will be provided".
- Everyday words: "idea", "challenge", "send", "check", not "submission
  artefact", "programme instance", "transmit".
- Errors say what happened and what to do: "We could not save your idea. Check
  your connection and try again."
- Never blame: "That code has expired. We sent a new one." not "Invalid OTP".
- Light wordplay is welcome in public headings, never in errors, legal text or
  anything about money decisions.
- Sentence case for buttons, headings, tabs and status chips.
- Setswana strings are written by a Setswana speaker or checked by one. Do not
  machine-translate and ship. Mark unchecked strings with `// TODO tn-review`.
