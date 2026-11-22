// The "Need help?" guide (2.14). guide.target.<id>: the short label sent to the guide for each data-guide target
// (the list is in docs/guide-targets.md). Same guide.* keys as the staff console.
// TODO tn-review: the Setswana strings below need a check by a Setswana speaker.

export const guideEn = {
  'guide.button': 'Need help?',
  'guide.title': 'Need help?',
  'guide.close': 'Close the guide',
  'guide.language': 'Language of the guide',
  'guide.intro': 'Ask how to do something on this page.',
  'guide.youAreOn': 'You are on {page}. Ask how to do something here.',
  'guide.askFirst': 'Ask a question, for example: what do I do here?',
  'guide.askAnother': 'Ask another question',
  'guide.ask': 'Ask',
  'guide.thinking': 'Finding the steps for you.',
  'guide.failed': "The guide can't answer right now.",
  'guide.failedBody': 'Try again in a moment, or talk to a person.',
  'guide.progress': 'Steps done',
  'guide.stepOf': 'Step {n} of {total}',
  'guide.showMe': 'Show me',
  'guide.next': 'Next',
  'guide.skip': 'Skip this step',
  'guide.skipShort': 'Skip',
  'guide.checkIdea': 'Check my idea',
  'guide.moveOn': 'I move to the next step when you finish this one. Answers come in the language you write in.',
  'guide.notHere': "I can't see this on the page yet. Skip this step, or carry on and I'll show it when it appears.",
  'guide.done': 'All done. Ask another question if you need more help.',
  'guide.from': 'From:',
  'guide.talk': 'Talk to a person',
  'guide.shrink': 'Shrink the guide',
  'guide.grow': 'Show the whole guide',
  'guide.handedOver': 'Your question went to the team',
  'guide.handedOverBody': 'Someone will reply in your notifications.',
  'guide.handOverFailed': 'We could not send your question',
  'guide.handOverFailedBody': 'Try again, or ask your admin.',
  'guide.target.nav.submitIdea': 'Submit an idea',
  'guide.target.nav.challenges': 'Challenges',
  'guide.target.nav.signIn': 'Sign in',
  'guide.target.home.primaryAction': 'Main button on the home page',
  'guide.target.home.secondaryAction': 'Second button on the home page',
  'guide.target.challenge.enter': 'Enter this challenge',
  'guide.target.idea.next': 'Save and continue',
  'guide.target.idea.back': 'Back',
  'guide.target.idea.saveExit': 'Save and exit',
  'guide.target.idea.send': 'Send my idea',
  'guide.target.myIdeas.new': 'New idea',
  'guide.target.myIdeas.open': 'Open an idea',
  'guide.target.track.progress': 'Where your idea is',
  'guide.target.track.reply': 'Reply to the officer',
}

export const guideTn: Record<keyof typeof guideEn, string> = {
  'guide.button': 'O tlhoka thuso?', // TODO tn-review
  'guide.title': 'O tlhoka thuso?', // TODO tn-review
  'guide.close': 'Tswala kaedi', // TODO tn-review
  'guide.language': 'Puo ya kaedi', // TODO tn-review
  'guide.intro': 'Botsa gore o dira jang sengwe mo tsebeng e.', // TODO tn-review
  'guide.youAreOn': 'O mo go {page}. Botsa gore o dira jang sengwe fano.', // TODO tn-review
  'guide.askFirst': 'Botsa potso, sekai: ke dira eng fa?', // TODO tn-review
  'guide.askAnother': 'Botsa potso e nngwe', // TODO tn-review
  'guide.ask': 'Botsa', // TODO tn-review
  'guide.thinking': 'Re go batlela dikgato.', // TODO tn-review
  'guide.failed': 'Kaedi ga e kgone go araba jaanong.', // TODO tn-review
  'guide.failedBody': 'Leka gape morago ga nakwana, kgotsa bua le motho.', // TODO tn-review
  'guide.progress': 'Dikgato tse di dirilweng', // TODO tn-review
  'guide.stepOf': 'Kgato {n} ya {total}', // TODO tn-review
  'guide.showMe': 'Mpontsha', // TODO tn-review
  'guide.next': 'E e latelang', // TODO tn-review
  'guide.skip': 'Tlola kgato e', // TODO tn-review
  'guide.skipShort': 'Tlola', // TODO tn-review
  'guide.checkIdea': 'Sekaseka kakanyo ya me', // TODO tn-review
  'guide.moveOn': 'Ke ya kwa kgatong e e latelang fa o fetsa e. Dikarabo di tla ka puo e o kwalang ka yona.', // TODO tn-review
  'guide.notHere': 'Ga ke e bone mo tsebeng ga jaana. Tlola kgato e, kgotsa tswelela mme ke tla e bontsha fa e tlhagelela.', // TODO tn-review
  'guide.done': 'Go weditswe. Botsa potso e nngwe fa o tlhoka thuso e nngwe.', // TODO tn-review
  'guide.from': 'Go tswa go:', // TODO tn-review
  'guide.talk': 'Bua le motho', // TODO tn-review
  'guide.shrink': 'Fokotsa kaedi', // TODO tn-review
  'guide.grow': 'Bontsha kaedi yotlhe', // TODO tn-review
  'guide.handedOver': 'Potso ya gago e ile kwa setlhopheng', // TODO tn-review
  'guide.handedOverBody': 'Mongwe o tla araba mo dikitsisong tsa gago.', // TODO tn-review
  'guide.handOverFailed': 'Ga re a kgona go romela potso ya gago', // TODO tn-review
  'guide.handOverFailedBody': 'Leka gape, kgotsa botsa motsamaisi wa gago.', // TODO tn-review
  'guide.target.nav.submitIdea': 'Romela kakanyo', // TODO tn-review
  'guide.target.nav.challenges': 'Dikgwetlho', // TODO tn-review
  'guide.target.nav.signIn': 'Tsena', // TODO tn-review
  'guide.target.home.primaryAction': 'Konopo e kgolo mo tsebeng ya ntlha', // TODO tn-review
  'guide.target.home.secondaryAction': 'Konopo ya bobedi mo tsebeng ya ntlha', // TODO tn-review
  'guide.target.challenge.enter': 'Tsenela kgwetlho e', // TODO tn-review
  'guide.target.idea.next': 'Boloka o tswelele', // TODO tn-review
  'guide.target.idea.back': 'Boela morago', // TODO tn-review
  'guide.target.idea.saveExit': 'Boloka o tswe', // TODO tn-review
  'guide.target.idea.send': 'Romela kakanyo ya me', // TODO tn-review
  'guide.target.myIdeas.new': 'Kakanyo e ntshwa', // TODO tn-review
  'guide.target.myIdeas.open': 'Bula kakanyo', // TODO tn-review
  'guide.target.track.progress': 'Fa kakanyo ya gago e leng teng', // TODO tn-review
  'guide.target.track.reply': 'Araba motlhankedi', // TODO tn-review
}
