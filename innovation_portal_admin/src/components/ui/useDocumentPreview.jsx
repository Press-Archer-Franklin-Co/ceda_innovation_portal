import { useCallback, useMemo, useState } from 'react'
import DocumentPreview from './DocumentPreview'
import { useTrigger } from './useTrigger'

/**
 * One preview for a list of files:
 *   const preview = useDocumentPreview()
 *   <Button onClick={(e) => preview.show(e, { name, mime, load, download })}>Preview</Button>
 *   {preview.element}
 */
export function useDocumentPreview() {
  const trigger = useTrigger()
  const { from } = trigger
  const [file, setFile] = useState(null)
  const [open, setOpen] = useState(false)
  const show = useCallback((e, next) => {
    from(e)
    setFile(next)
    setOpen(true)
  }, [from])
  const close = useCallback(() => setOpen(false), [])
  const element = useMemo(() => <DocumentPreview open={open} onClose={close} triggerRef={trigger.ref} file={file} />, [open, close, trigger.ref, file])
  return { show, element }
}
