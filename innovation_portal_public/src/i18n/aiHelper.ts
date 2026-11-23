// The AI helper panel on the idea form (2.13). Plain words: the helper suggests, officers decide.
// TODO tn-review: the Setswana strings below need a check by a Setswana speaker.

export const aiHelperEn = {
  'ai.title': 'AI helper',
  'ai.subtitle': 'Tips from the AI helper. Officers decide, not the AI.',
  'ai.tipsCount': '{count} tips',
  'ai.tipsOne': '1 tip',
  'ai.waiting': 'Fill in this step. Tips show here when you leave a field.',
  'ai.looking': 'Looking at this step…',
  'ai.allGood': 'Nothing to add on this step for now.',
  'ai.failed': "The AI helper can't look at this step right now.",
  'ai.retry': 'Try again',
  'ai.showMe': 'Show me where',
  'ai.reading': 'Reading your document…',
  'ai.docFailed': "The AI helper couldn't read {name} right now.",
  'ai.docUnreadable': "The AI helper can't read {name}.",
  'ai.docMissing': 'Missing: {list}',
  'ai.check': 'Check my idea',
  'ai.checkAgain': 'Check again',
  'ai.backToForm': 'Back to my form',
  'ai.close': 'Close',
  'ai.private': 'Your answers are not shared or used to train AI. You can submit without using this.',
  'ai.ready': 'Clear and complete',
  'ai.almost': 'Almost there',
  'ai.needsWork': 'Some parts are missing',
  'ai.strongCount': '{n} of {total} parts strong',
  'ai.status.clear': 'Strong',
  'ai.status.add_more': 'Could be better',
  'ai.status.missing': 'Missing',
  'ai.checking': 'Checking part {n} of {total}…',
  'ai.checkFailed': "The AI helper can't check your idea right now.",
  'ai.off': 'The AI helper is off right now.',
  'ai.nothing': 'Answer some questions first, then check again.',
}

export const aiHelperTn: Record<keyof typeof aiHelperEn, string> = {
  'ai.title': 'Mothusi wa AI', // TODO tn-review
  'ai.subtitle': 'Dikeletso tse di tswang mo mothusing wa AI. Batlhankedi ba a swetsa, e seng AI.', // TODO tn-review
  'ai.tipsCount': 'Dikeletso di le {count}', // TODO tn-review
  'ai.tipsOne': 'Keletso e le nngwe', // TODO tn-review
  'ai.waiting': 'Tlatsa karolo e. Dikeletso di tla bonala fa fa o tswa mo lefelong.', // TODO tn-review
  'ai.looking': 'Ke leba karolo e…', // TODO tn-review
  'ai.allGood': 'Ga go na sepe se o ka se okelelang mo karolong e ga jaana.', // TODO tn-review
  'ai.failed': 'Mothusi wa AI ga a kgone go leba karolo e ga jaana.', // TODO tn-review
  'ai.retry': 'Leka gape', // TODO tn-review
  'ai.showMe': 'Mpontsha kwa', // TODO tn-review
  'ai.reading': 'Ke bala tokomane ya gago…', // TODO tn-review
  'ai.docFailed': 'Mothusi wa AI ga a kgona go bala {name} ga jaana.', // TODO tn-review
  'ai.docUnreadable': 'Mothusi wa AI ga a kgone go bala {name}.', // TODO tn-review
  'ai.docMissing': 'Go tlhaela: {list}', // TODO tn-review
  'ai.check': 'Sekaseka kakanyo ya me', // TODO tn-review
  'ai.checkAgain': 'Sekaseka gape', // TODO tn-review
  'ai.backToForm': 'Boela kwa foromong ya me', // TODO tn-review
  'ai.close': 'Tswala', // TODO tn-review
  'ai.private': 'Dikarabo tsa gago ga di abelanwe e bile ga di dirisediwe go ruta AI. O ka romela o sa dirise se.', // TODO tn-review
  'ai.ready': 'Go tlhamaletse e bile go feletse', // TODO tn-review
  'ai.almost': 'O gaufi', // TODO tn-review
  'ai.needsWork': 'Dikarolo dingwe di a tlhaela', // TODO tn-review
  'ai.strongCount': 'Dikarolo di le {n} mo go di le {total} di nonofile', // TODO tn-review
  'ai.status.clear': 'E nonofile', // TODO tn-review
  'ai.status.add_more': 'E ka tokafala', // TODO tn-review
  'ai.status.missing': 'E a tlhaela', // TODO tn-review
  'ai.checking': 'Ke sekaseka karolo {n} ya {total}…', // TODO tn-review
  'ai.checkFailed': 'Mothusi wa AI ga a kgone go sekaseka kakanyo ya gago ga jaana.', // TODO tn-review
  'ai.off': 'Mothusi wa AI o tswetswe ga jaana.', // TODO tn-review
  'ai.nothing': 'Araba dipotso dingwe pele, morago o sekaseke gape.', // TODO tn-review
}
