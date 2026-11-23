// "Send your idea another way" on the home and FAQ pages.
// TODO tn-review: the Setswana strings below need a check by a Setswana speaker.

export const otherWaysEn = {
  'ways.title': 'Send your idea another way',
  'ways.whatsapp': 'WhatsApp',
  'ways.whatsappBody': 'Message {number} and we will take you through your idea step by step.',
  'ways.whatsappButton': 'Open WhatsApp',
  'ways.ussd': 'USSD, no data needed',
  'ways.ussdBody': 'Dial {code} on any phone and follow the menu.',
  'ways.ussdButton': 'Dial {code}',
}

export const otherWaysTn: Record<keyof typeof otherWaysEn, string> = {
  'ways.title': 'Romela kakanyo ya gago ka tsela e nngwe', // TODO tn-review
  'ways.whatsapp': 'WhatsApp', // TODO tn-review
  'ways.whatsappBody': 'Romela molaetsa go {number} mme re tla go tsamaisa mo kakanyong ya gago kgato ka kgato.', // TODO tn-review
  'ways.whatsappButton': 'Bula WhatsApp', // TODO tn-review
  'ways.ussd': 'USSD, ga o tlhoke data', // TODO tn-review
  'ways.ussdBody': 'Letsa {code} ka mogala ope fela o bo o latela lenaane.', // TODO tn-review
  'ways.ussdButton': 'Letsa {code}', // TODO tn-review
}
