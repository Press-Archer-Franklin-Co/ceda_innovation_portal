import { createContext, useContext } from 'react'

export const EditorPanelContext = createContext({ inSheet: false })

/** True while the panel's content is inside EditorWorkspace's phone sheet (it already has a title and close). */
export function useEditorPanel() {
  return useContext(EditorPanelContext)
}
