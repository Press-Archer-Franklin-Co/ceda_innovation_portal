import { describe, expect, it } from 'vitest'
import { untriggeredOverlays } from '../../../scripts/overlay_tags.mjs'

// The guard behind scripts/check_old_ui.mjs: every <Modal opens out of the control that was used.

describe('modal guard', () => {
  it('fails on a Modal without triggerRef', () => {
    expect(untriggeredOverlays('<Modal open={o} onClose={c} title="x">body</Modal>')).toEqual([{ line: 1, name: 'Modal' }])
  })

  it('sees past a deep footer prop, and does not take a nested triggerRef for the Modal', () => {
    const deep = `<Modal open={o} footer={<div>{a ? <Button onClick={() => { go({ x: 1 }) }}>Go</Button> : <span />}</div>}>x</Modal>`
    expect(untriggeredOverlays(deep)).toHaveLength(1)
    const nested = `<Modal open={o} footer={<Popover triggerRef={r} open />}>x</Modal>`
    expect(untriggeredOverlays(nested).map((m) => m.name)).toEqual(['Modal'])
  })

  it('does not accept routeOpened on a Modal', () => {
    expect(untriggeredOverlays('<Modal open routeOpened>x</Modal>')).toHaveLength(1)
  })

  it('passes a Modal with triggerRef, and a Drawer opened by a route', () => {
    expect(untriggeredOverlays('<Modal open={o} triggerRef={t.ref} footer={<b>{"a>b"}</b>}>x</Modal>')).toEqual([])
    expect(untriggeredOverlays('<Drawer open={o} routeOpened label="x" />')).toEqual([])
  })
})
