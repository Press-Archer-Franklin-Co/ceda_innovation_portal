import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

// Toggle (components/ui/Choice) calls onChange(true | false), not with the event. Reading e.target.checked
// there throws, so the switch never moves (Live chat Saturday and Sunday, 23 Nov).
function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : /\.(jsx?|tsx?)$/.test(name) && !/\.test\./.test(name) ? [path] : []
  })
}

describe('Toggle onChange', () => {
  test('no screen reads e.target.checked from a Toggle', () => {
    const offenders = []
    for (const path of files(join(__dirname, '..', '..'))) {
      const text = readFileSync(path, 'utf8')
      for (const match of text.matchAll(/<Toggle\b[^>]*?onChange=\{\(?\s*(\w+)\s*\)?\s*=>[^}]*?\1\.target\.checked/gs)) {
        offenders.push(`${path}: ${match[0].slice(0, 80)}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
