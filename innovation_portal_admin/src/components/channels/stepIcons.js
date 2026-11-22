import { BellRing, Circle, CircleStop, ClipboardList, FolderOpen, GitBranch, Headset, HelpCircle, Languages, ListOrdered, MessageSquare, Paperclip, Save, Search, Send } from 'lucide-react'

// Icons for the step types the API lists today; a type added later gets a plain circle.
const ICONS = {
  menu: ListOrdered,
  message: MessageSquare,
  question: HelpCircle,
  save_draft: Save,
  lookup: Search,
  condition: GitBranch,
  subscribe: BellRing,
  language: Languages,
  handoff: Headset,
  end: CircleStop,
  file: Paperclip,
  submit: Send,
  form_questions: ClipboardList,
  my_ideas: FolderOpen,
}

export function stepIcon(type) {
  return ICONS[type] ?? Circle
}
