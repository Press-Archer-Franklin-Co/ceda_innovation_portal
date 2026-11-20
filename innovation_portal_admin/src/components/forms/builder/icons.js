import {
  AlignLeft, Bold, Calendar, CheckSquare, ChevronDown, CircleDot, FileText, Hash, Image, Link2, Mail, MapPin,
  Phone, ToggleLeft, Type, Upload, User,
} from 'lucide-react'

/** One icon per element type, as in the Figma palette. */
export const TYPE_ICON = {
  text: Type,
  textarea: FileText,
  number: Hash,
  date: Calendar,
  select: ChevronDown,
  radio: CircleDot,
  checkboxes: CheckSquare,
  multiselect: CheckSquare,
  yes_no: ToggleLeft,
  boolean: CheckSquare,
  phone: Phone,
  email: Mail,
  district: MapPin,
  omang_id: User,
  file: Upload,
  media: Image,
  heading: Bold,
  paragraph: AlignLeft,
  url: Link2,
}
