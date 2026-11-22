import { useEffect } from 'react'

/** Sets the browser tab title for a page: "Help · CEDA Innovation". */
export function usePageTitle(title: string) {
  useEffect(() => {
    if (title) document.title = `${title} · CEDA Innovation`
  }, [title])
}
