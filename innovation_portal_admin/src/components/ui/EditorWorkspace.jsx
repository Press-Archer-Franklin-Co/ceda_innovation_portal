import { useRef } from 'react'
import { useT } from '../../i18n/context'
import { cn } from '../../lib/cn'
import { useMediaQuery } from '../../lib/useMediaQuery'
import Modal from './Modal'
import { EditorPanelContext } from './editorPanel'

/**
 * The one layout for builders: a header on top, the canvas in the remaining width and a properties panel on the
 * right. From 1024px the page itself does not scroll (index.css, main:has([data-editor-workspace])): the side
 * column, the canvas and the panel each scroll on their own, so long settings never move the page.
 * Below 1024px the columns stack, and the panel opens as a bottom sheet when something is selected.
 *
 * header     page title, status and actions
 * notices    alerts under the header (they stay in view)
 * side       optional left column inside the canvas area (palette, section list)
 * children   the canvas
 * panel      the settings of what is selected; null shows `empty`
 * empty      what the panel shows with nothing selected (default: "Select a step to see its settings")
 * panelLabel the panel's name, for screen readers and the sheet title
 * onClosePanel  closes the phone sheet (clear the selection)
 * phonePanel "sheet" (default), or "inline" for a panel that is not about a selection (previews)
 * noPanel    a screen with no right-hand panel, as its frame shows
 */
export default function EditorWorkspace({
  header, notices, side, children, panel = null, empty, panelLabel, onClosePanel, phonePanel = 'sheet', noPanel = false, className,
}) {
  const t = useT()
  const desktop = useMediaQuery('(min-width: 1024px)')
  const lastClicked = useRef(null)
  const emptyPanel = empty ?? <p className="rounded-card border border-border bg-surface p-[14px] text-[13px] text-muted">{t('editor.selectStep')}</p>
  const label = panelLabel ?? t('editor.settings')
  const showColumn = !noPanel && (desktop || phonePanel === 'inline')

  return (
    <div data-editor-workspace className={cn('flex flex-col gap-[14px] lg:h-full lg:min-h-0 2xl:gap-[18px]', className)}>
      <div className="flex shrink-0 flex-col gap-[14px] [&>*]:mb-0">
        {header}
        {notices}
      </div>
      <div className={cn('flex min-w-0 flex-col gap-[14px] lg:min-h-0 lg:flex-1 lg:flex-row 2xl:gap-[18px]')}>
        {side && <div data-editor-side className="min-w-0 shrink-0 lg:h-full lg:overflow-y-auto lg:overscroll-contain">{side}</div>}
        <div
          data-editor-canvas
          onClickCapture={(e) => { lastClicked.current = e.target.closest?.('button,a,[role="button"],li') ?? e.target }}
          className="min-w-0 flex-1 lg:h-full lg:overflow-y-auto lg:overscroll-contain"
        >
          {children}
        </div>
        {showColumn && (
          <aside
            data-editor-panel
            aria-label={label}
            tabIndex={desktop ? 0 : undefined}
            className="min-w-0 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:sticky lg:top-0 lg:h-full lg:w-[300px] lg:overflow-y-auto lg:overscroll-contain xl:w-[360px]"
          >
            {panel ?? emptyPanel}
          </aside>
        )}
      </div>
      {!noPanel && !desktop && phonePanel === 'sheet' && (
        <Modal open={Boolean(panel)} onClose={() => onClosePanel?.()} title={label} triggerRef={lastClicked} sheet bodyClassName="!px-4">
          <EditorPanelContext.Provider value={{ inSheet: true }}>{panel}</EditorPanelContext.Provider>
        </Modal>
      )}
    </div>
  )
}
