// Setswana strings for UI chrome. Must have every key in en.ts (checked by TypeScript).
// First draft: needs review by a Setswana speaker at CEDA before launch.
import type { StringKey } from './en'
import { innovatorTn } from './innovator'

const tn: Record<StringKey, string> = {
  'lang.en': 'English',
  'lang.tn': 'Setswana',
  'lang.label': 'Puo',

  'common.close': 'Tswala',
  'common.confirm': 'Netefatsa',
  'common.cancel': 'Khansela',
  'common.save': 'Boloka',
  'common.saving': 'E a boloka…',
  'common.retry': 'Leka gape',
  'common.loading': 'E a laola',
  'common.optional': 'ga go patelesege',
  'common.required': 'go a tlhokega',
  'common.search': 'Batla',
  'common.noMatches': 'Ga go se se tshwanang',
  'common.choose': 'Tlhopha…',
  'common.new': 'Sesha',
  'common.done': 'Go weditswe',
  'common.notKnown': 'Ga go itsiwe',
  'common.somethingWrong': 'Go na le se se sa tsamaeng sentle',
  'common.charsLeft': 'Ditlhaka di le {count} di setse',
  'common.charsOver': 'Ditlhaka di feta ka {count}',
  'common.skip': 'Tlolela kwa diteng',
  'common.removeItem': 'Tlosa {item}', // TODO tn-review
  'common.dismiss': 'Tlosa',
  'common.notifications': 'Dikitsiso',
  'common.unread': 'Di le {count} tse di sa balwang',
  'common.menu': 'Lenaane',
  'common.account': 'Akhaonto ya gago',
  'common.signIn': 'Tsena',
  'common.signOut': 'Tswa',

  'status.draft': 'Kakanyetso', // TODO tn-review
  'status.submitted': 'E rometswe', // TODO tn-review
  'status.in_review': 'E a sekasekwa', // TODO tn-review
  'status.needs_input': 'E tlhoka thuso ya gago', // TODO tn-review
  'status.shortlisted': 'E tlhophilwe', // TODO tn-review
  'status.approved': 'E amogetswe', // TODO tn-review
  'status.winner': 'Mofenyi', // TODO tn-review
  'status.not_taken': 'Ga e a tswelela', // TODO tn-review
  'status.open': 'E bulegile', // TODO tn-review
  'status.closed': 'E tswetswe', // TODO tn-review
  'status.upcoming': 'E a tla', // TODO tn-review
  'status.published': 'E phasaladitswe', // TODO tn-review
  'status.scheduled': 'E rulagantswe', // TODO tn-review
  'status.waiting_approval': 'E emetse tetla', // TODO tn-review
  'status.archived': 'E bolokilwe', // TODO tn-review
  'status.assigned': 'E abetswe', // TODO tn-review
  'status.in_progress': 'E a dirwa', // TODO tn-review
  'status.done': 'Go weditswe', // TODO tn-review
  'status.active': 'E a dira', // TODO tn-review
  'status.inactive': 'E tima', // TODO tn-review
  'status.waiting': 'E emetse', // TODO tn-review
  'status.not_started': 'Ga e a simolola', // TODO tn-review
  'status.declined': 'E gannwe', // TODO tn-review
  'status.reassigned': 'E abetswe sesha', // TODO tn-review
  'status.locked': 'E notletswe', // TODO tn-review
  'status.cancelled': 'E khanseletswe', // TODO tn-review
  'status.withdrawn': 'E gogilwe morago', // TODO tn-review
  'status.unknown': 'Ga go itsiwe', // TODO tn-review

  'error.page': 'Tsebe e e ga e a kgona go bulega', // TODO tn-review
  'error.pageBody': 'Bothata bo kwa go rona. Tiro ya gago e babalesegile. Leka gape morago ga nakwana.', // TODO tn-review
  'error.newVersion': 'Go na le kgatiso e ntšhwa ya webosaete', // TODO tn-review
  'error.newVersionBody': 'Simolola sesha go bona kgatiso ya bosheng. Se o se bolokileng se a bolokwa.', // TODO tn-review
  'error.reload': 'Simolola sesha', // TODO tn-review

  'home.loadError': 'Ga re a kgona go bula tsebe ya ntlha', // TODO tn-review
  'home.loadErrorBody': 'Tlhola kgolagano ya gago o bo o leke gape.', // TODO tn-review
  'home.pill': 'Dikakanyo di amogelwa ngwaga otlhe', // TODO tn-review
  'home.check1': 'Ga go duelelwe', // TODO tn-review
  'home.check2': 'Latela mo webosaeteng, WhatsApp kgotsa USSD', // TODO tn-review
  'home.check3': 'Motlhankedi wa CEDA o a araba', // TODO tn-review
  'qs.title': 'Simolola kakanyo ya gago ka metsotso e le 2', // TODO tn-review
  'qs.step': 'Kgato {n} go 2', // TODO tn-review
  'qs.intro': 'Ditlhaloso tsa motheo fela jaanong. O ka oketsa dintlha, ditshwantsho le dikwalo morago.', // TODO tn-review
  'qs.ideaLabel': 'Kakanyo ya gago e bidiwa eng?', // TODO tn-review
  'qs.ideaPlaceholder': 'sk. Dinamune tsa phane tse di omisitsweng ka letsatsi', // TODO tn-review
  'qs.ideaHint': 'Le le khutshwane le le motlhofo le botoka', // TODO tn-review
  'qs.sector': 'Ke lephata lefe le le tshwanelang?', // TODO tn-review
  'qs.notSure': 'Ga ke itse', // TODO tn-review
  'qs.challenge': 'A e le ya kgwetlho?', // TODO tn-review
  'qs.general': 'Nnyaa, ke kakanyo ya kakaretso', // TODO tn-review
  'qs.continue': 'Tswelela', // TODO tn-review
  'qs.privacy': 'Kakanyetso ya gago e bolokwa ka bo yone. E sireleditswe ke Molao wa Tshireletso ya Tshedimosetso.', // TODO tn-review
  'qs.saving': 'E a boloka…', // TODO tn-review
  'qs.saved': 'E bolokilwe', // TODO tn-review
  'qs.needSector': 'Tlhopha lephata mme re tla boloka kakanyetso ya gago.', // TODO tn-review
  'qs.titleError': 'Naya kakanyo ya gago leina le lekhutshwane.', // TODO tn-review
  'qs.sectorError': 'Tlhopha lephata le le tshwanelang botoka.', // TODO tn-review
  'qs.saveError': 'Ga re a kgona go boloka kakanyetso ya gago. Tlhola kgolagano o bo o leke gape.', // TODO tn-review
  'qs.sectorsError': 'Ga re a kgona go bula mafapha. Leka gape morago ga nakwana.', // TODO tn-review
  'home.challengesOver': 'Dikgwetlho tse di nang le malatsi a bofelo', // TODO tn-review
  'home.challengesSub': 'Ka dinako tse dingwe CEDA e kopa dikakanyo ka bothata bongwe. Kgwetlho nngwe le nngwe e na le letsatsi la bofelo le thuso ya yone.', // TODO tn-review
  'ch.daysLeft': 'Go setse malatsi a le {n}', // TODO tn-review
  'ch.lastDay': 'Letsatsi la bofelo', // TODO tn-review
  'ch.closes': 'E tswalwa {date}', // TODO tn-review
  'ch.opens': 'E bulwa {date}', // TODO tn-review
  'ch.closed': 'E tswetswe {date}', // TODO tn-review
  'ch.enter': 'Tsenela kgwetlho e', // TODO tn-review
  'ch.notify': 'Nkitsise fa e bulwa', // TODO tn-review
  'ch.seeResults': 'Bona dipoelo', // TODO tn-review
  'ch.generalTitle': 'Ga go na kgwetlho e e tshwanelang kakanyo ya gago?', // TODO tn-review
  'ch.generalBody': 'Go siame. Dikakanyo tsa kakaretso di amogelwa ngwaga otlhe. E romele mme motlhankedi o tla go kaela.', // TODO tn-review
  'ch.generalCta': 'Romela kakanyo ya kakaretso', // TODO tn-review
  'home.quotePrev': 'Mafoko a pele', // TODO tn-review
  'home.quoteNext': 'Mafoko a a latelang', // TODO tn-review
  'home.quoteOf': 'Mafoko {n} go {total}', // TODO tn-review
  'home.newsOver': 'Dikgang tsa ga jaana', // TODO tn-review
  'home.allNews': 'Dikgang tsotlhe', // TODO tn-review
  'home.play': 'Tshameka bidio: {title}', // TODO tn-review
  'post.news': 'Dikgang', // TODO tn-review
  'post.event': 'Tiragalo', // TODO tn-review
  'post.opportunity': 'Tshono', // TODO tn-review
  'post.result': 'Dipoelo', // TODO tn-review
  'post.notice': 'Kitsiso', // TODO tn-review
  'post.newsletter': 'Lekwalodikgang', // TODO tn-review
  'post.video': 'Bidio', // TODO tn-review
  'home.bulletinOver': 'Boto ya dikitsiso', // TODO tn-review
  'filter.all': 'Tsotlhe', // TODO tn-review
  'filter.notice': 'Dikitsiso', // TODO tn-review
  'filter.event': 'Ditiragalo', // TODO tn-review
  'filter.opportunity': 'Ditshono', // TODO tn-review
  'filter.result': 'Dipoelo', // TODO tn-review
  'filter.newsletter': 'Makwalodikgang', // TODO tn-review
  'home.noBulletin': 'Ga go na sepe mo botong mo setlhopheng se jaanong.', // TODO tn-review
  'sub.title': 'O se tlhole o tlhaelwa ke letsatsi la bofelo', // TODO tn-review
  'sub.body': 'Amogela dikitsiso, dikgwetlho le makwalodikgang a kgwedi ka tsela e o e ratang.', // TODO tn-review
  'sub.email': 'Imeile', // TODO tn-review
  'sub.whatsapp': 'Romela le mo WhatsApp', // TODO tn-review
  'sub.phone': 'Nomore ya WhatsApp', // TODO tn-review
  'sub.button': 'Ikwadise', // TODO tn-review
  'sub.unsub': 'O ka ikgogela morago nako nngwe le nngwe.', // TODO tn-review
  'sub.done': 'Tlhola imeile ya gago', // TODO tn-review
  'sub.doneBody': 'Re go romeletse kgolagano ya go netefatsa. Ga go sepe se se romelwang go fitlha o e tobetsa.', // TODO tn-review
  'sub.phoneError': 'Tsenya nomore ya WhatsApp jaaka 71 234 567.', // TODO tn-review
  'sub.busy': 'Go ikwadisitse batho ba bantsi go tswa fano jaanong. Tsweetswee leka gape morago ga metsotso e mmalwa.', // TODO tn-review
  'subLink.confirmTitle': 'Netefatsa go ikwadisa ga gago', // TODO tn-review
  'subLink.unsubTitle': 'Emisa dikitsiso', // TODO tn-review
  'subLink.working': 'Re tlhola kgolagano ya gago', // TODO tn-review
  'subLink.confirmedTitle': 'O ikwadisitse', // TODO tn-review
  'subLink.confirmedBody': 'O tla amogela dikitsiso tse dintsha, dikgwetlho le kakaretso ya kgwedi. Imeile nngwe le nngwe e na le kgolagano ya go di emisa.', // TODO tn-review
  'subLink.unsubscribedTitle': 'Ga o kitla o amogela dikitsiso gape', // TODO tn-review
  'subLink.unsubscribedBody': 'Re emisitse go go romelela dikitsiso tsa CEDA Innovation. O ka ikwadisa gape mo tsebeng ya dikgang.', // TODO tn-review
  'subLink.invalidTitle': 'Kgolagano e ga e dire', // TODO tn-review
  'subLink.invalidBody': 'Gongwe e setse e dirisitswe kgotsa e kopilwe karolo fela. Bula imeile ya bofelo go tswa go rona, kgotsa o ikwadise gape mo tsebeng ya dikgang.', // TODO tn-review
  'subLink.errorTitle': 'Ga re a kgona go tlhola kgolagano ya gago', // TODO tn-review
  'subLink.errorBody': 'Go na le se se sa tsamaeng sentle ka fa go rona. Tsweetswee leka gape.', // TODO tn-review
  'subLink.busyBody': 'Go nnile le maiteko a mantsi go tswa fano jaanong. Ema metsotso e mmalwa, o bo o leka gape.', // TODO tn-review
  'subLink.toNews': 'Ya kwa Dikgang le bulletin', // TODO tn-review
  'sub.emailError': 'Tsenya aterese ya imeile jaaka leina@example.co.bw.', // TODO tn-review
  'sub.error': 'Ga re a kgona go go kwadisa. Leka gape morago ga nakwana.', // TODO tn-review
  'home.sectorsOver': 'Boitshimololedi mo mafapheng otlhe', // TODO tn-review
  'home.sectorsSub': 'Tsela e e botoka, sedirwa se sesha kgotsa tirelo e e botlhale, tsotlhe di a bala. Fa ke ka moo boitshimololedi bo ka lebegang ka teng mo Botswana.', // TODO tn-review
  'home.howOver': 'Ka moo go dirang ka teng', // TODO tn-review
  'home.fullGuide': 'Kaelo e e feletseng', // TODO tn-review
  'home.storiesOver': 'Dikgang tsa katlego', // TODO tn-review
  'home.allStories': 'Dikgang tsotlhe', // TODO tn-review
  'home.partnersEmpty': 'Molekane', // TODO tn-review

  'qs2.title': 'Re ka go fitlhelela jang?', // TODO tn-review
  'qs2.edit': 'Fetola', // TODO tn-review
  'qs2.general': 'Kakanyo ya kakaretso', // TODO tn-review
  'postd.back': 'Dikgang le bulletin', // TODO tn-review
  'postd.notFound': 'Ga re a bona kgang e', // TODO tn-review
  'postd.notFoundBody': 'Gongwe e tlositswe kgotsa kgolagano ya yone e fetogile. Bona dikgang tsa bosheng.', // TODO tn-review
  'postd.loadError': 'Ga re a kgona go tsenya kgang e', // TODO tn-review
  'postd.watch': 'Lebelela bidio', // TODO tn-review
  'postd.related': 'Tse di amanang', // TODO tn-review
  // Site search (1.3)
  'search.open': 'Batla mo websaeteng', // TODO tn-review
  'search.label': 'Batla dikgwetlho, dikgang le thuso', // TODO tn-review
  'search.placeholder': 'Batla dikgwetlho, dikgang, thuso', // TODO tn-review
  'search.esc': 'Esc',
  'search.group.challenges': 'Dikgwetlho', // TODO tn-review
  'search.group.stories': 'Dikgang tsa katlego le dikakanyo', // TODO tn-review
  'search.group.posts': 'Dikgang', // TODO tn-review
  'search.group.help': 'Thuso', // TODO tn-review
  'search.story': 'Kgang ya katlego', // TODO tn-review
  'search.faq': 'Setlhogo sa thuso', // TODO tn-review
  'search.guide': 'Kaedi', // TODO tn-review
  'search.hint': 'Kwala ditlhaka di le 2 bonnye.', // TODO tn-review
  'search.keys': '↑ ↓ go tsamaya · Enter go bula', // TODO tn-review
  'search.count': 'Dipoelo di le {n} tsa “{q}”', // TODO tn-review
  'search.countOne': 'Poelo e le 1 ya “{q}”', // TODO tn-review
  'search.none': 'Ga go a bonwa sepe sa “{q}”', // TODO tn-review
  'search.noneBody': 'Leka lefoko le le khutshwane kgotsa le sele, kgotsa o re botse mo Thusong.', // TODO tn-review
  'search.askHelp': 'Ya kwa Thusong', // TODO tn-review
  'search.error': 'Patlo ga e dire jaanong.', // TODO tn-review
  'search.loading': 'Re a batla', // TODO tn-review
  'search.opensNew': '(e bula mo tsebeng e ntšha)', // TODO tn-review
  'qs2.name': 'Leina ka botlalo', // TODO tn-review
  'qs2.district': 'Kgaolo', // TODO tn-review
  'qs2.districtLoading': 'Re tsenya dikgaolo', // TODO tn-review
  'qs2.districtError': 'Tlhopha kgaolo mo lenaneng.', // TODO tn-review
  'qs2.email': 'Imeile', // TODO tn-review
  'qs2.emailHint': 'Re romela khopi ya kakanyo ya gago fano.', // TODO tn-review
  'qs2.emailError': 'Tsenya aterese ya imeile jaaka name@example.co.bw.', // TODO tn-review
  'qs2.nameError': 'Re bolelele leina la gago.', // TODO tn-review
  'qs2.phone': 'Nomore ya selefouno (WhatsApp fa o na le yone)', // TODO tn-review
  'qs2.phoneHint': 'Re romela khoutu ya dinomore di le 6 go netefatsa. Dikitsiso di tla fa gape.', // TODO tn-review
  'qs2.phoneError': 'Tsenya nomore ya selefouno jaaka 71 234 567.', // TODO tn-review
  'qs2.sendCode': 'Romela khoutu', // TODO tn-review
  'qs2.code': 'Khoutu ya dinomore di le 6', // TODO tn-review
  'qs2.codeHint': 'E rometswe go {to}.', // TODO tn-review
  'qs2.confirm': 'Netefatsa', // TODO tn-review
  'qs2.resendIn': 'Romela gape mo {time}', // TODO tn-review
  'qs2.resend': 'Romela khoutu e ntšhwa', // TODO tn-review
  'qs2.codeError': 'Khoutu eo ga e a dira. E tlhole kgotsa o kope e ntšhwa.', // TODO tn-review
  'qs2.sendError': 'Ga re a kgona go romela khoutu. Tlhola nomore o bo o leke gape.', // TODO tn-review
  'qs2.confirmed': 'Nomore e netefaditswe', // TODO tn-review
  'qs2.change': 'Fetola nomore', // TODO tn-review
  'qs2.account': 'Ntirela akhaonto gore ke kgone go latela le go fetola', // TODO tn-review
  'qs2.accountHint': 'Ga go tlhokege lefoko la sephiri. Tsena ka khoutu.', // TODO tn-review
  'qs2.accountRequired': 'Ditsenelo tsa dikgwetlho di tlhoka akhaonto, ka jalo re go direla yone.', // TODO tn-review
  'qs2.signedIn': 'O tsene jaaka {name}. Kakanyo ya gago e ya mo akhaontong ya gago.', // TODO tn-review
  'qs2.consent': 'Ke dumela gore CEDA e ka ikgolaganya le nna ka kakanyo e mme e boloke dintlha tsa me jaaka kitsiso ya sephiri e tlhalosa.', // TODO tn-review
  'qs2.consentError': 'Tshwaya lebokoso go dumela pele o romela.', // TODO tn-review
  'qs2.back': 'Boela morago', // TODO tn-review
  'qs2.send': 'Romela kakanyo ya me', // TODO tn-review
  'qs2.sendFail': 'Ga re a kgona go romela kakanyo ya gago. Kakanyetso ya gago e babalesegile. Leka gape morago ga nakwana.', // TODO tn-review
  'qs2.phoneFirst': 'Netefatsa nomore ya gago ka khoutu pele.', // TODO tn-review
  'qs2.needMore': 'Kakanyo ya gago e tlhoka dikarabo di le mmalwa pele re e romela. Thalo ya gago e bolokilwe.', // TODO tn-review
  'qs.introFull': 'Dikgato tse pedi tse dikhutshwane. Pele o romela, re go botsa gore kakanyo ya gago e rarabolola bothata bofe le gore jang.', // TODO tn-review
  'qs2.problem': 'Kakanyo ya gago e rarabolola bothata bofe?', // TODO tn-review
  'qs2.solution': 'Kakanyo ya gago e bo rarabolola jang?', // TODO tn-review
  'qs2.problemError': 'Re bolelele bothata ka polelo e le nngwe kgotsa tse pedi.', // TODO tn-review
  'qs2.solutionError': 'Re bolelele gore kakanyo ya gago e bo rarabolola jang.', // TODO tn-review
  'qs2.answerBelow': 'Araba dipotso tse pedi ka kakanyo ya gago, o bo o e romela. Thalo ya gago e bolokilwe.', // TODO tn-review

  'video.showTranscript': 'Bontsha mafoko', // TODO tn-review
  'video.hideTranscript': 'Fitlha mafoko', // TODO tn-review
  'video.noCaptions': 'Bidio e ga e ise e nne le mafoko a a kwadilweng.', // TODO tn-review
  'video.related': 'Tse di amanang', // TODO tn-review
  'video.loadError': 'Ga re a kgona go bula kgang e', // TODO tn-review
  'video.readMore': 'Bala kgang yotlhe', // TODO tn-review
  'video.noVideo': 'Kgang e ga e na bidio.', // TODO tn-review
  'video.transcript': 'Mafoko a bidio', // TODO tn-review

  'sent.title': 'Kakanyo ya gago e amogetswe.', // TODO tn-review
  'sent.wellDone': 'O dirile sentle, {name}!', // TODO tn-review
  'sent.wellDoneNoName': 'O dirile sentle!', // TODO tn-review
  'sent.copyTo': 'Re rometse khopi go {to} ka {channel}.', // TODO tn-review
  'sent.channel.sms': 'SMS', // TODO tn-review
  'sent.channel.email': 'imeile', // TODO tn-review
  'sent.channel.whatsapp': 'WhatsApp', // TODO tn-review
  'sent.reference': 'Nomore ya gago ya tshupetso', // TODO tn-review
  'sent.copy': 'Kopisa', // TODO tn-review
  'sent.copied': 'E kopisitswe', // TODO tn-review
  'sent.share': 'Abelana ka WhatsApp', // TODO tn-review
  'sent.shareText': 'Kakanyo ya me e kwa CEDA. Nomore ya tshupetso: {ref}', // TODO tn-review
  'sent.nextOver': 'Se se latelang', // TODO tn-review
  'sent.nextTitle': 'Dikgato di le {n}, mme o ka bona nngwe le nngwe', // TODO tn-review
  'sent.received': 'E amogetswe', // TODO tn-review
  'sent.receivedWhen': 'Gompieno, {when}', // TODO tn-review
  'sent.next': 'E e latelang', // TODO tn-review
  'sent.addTitle': 'Oketsa dintlha jaanong', // TODO tn-review
  'sent.addBody': 'Ditshwantsho, bidio e khutshwane kgotsa dikwalo di thusa batlhankedi go tlhaloganya kakanyo ya gago.', // TODO tn-review
  'sent.addCta': 'Oketsa dintlha', // TODO tn-review
  'sent.trackTitle': 'E latele ka tsela e o e ratang', // TODO tn-review
  'sent.trackBody': 'Akhaonto ya gago, dikitsiso tsa WhatsApp, kgotsa leletsa {ussd} o bo o tsenya nomore ya gago ya tshupetso.', // TODO tn-review
  'sent.trackBodyNoUssd': 'Akhaonto ya gago kgotsa dikitsiso tsa WhatsApp, ka nomore ya gago ya tshupetso.', // TODO tn-review
  'sent.trackCta': 'Bula letlapa la me', // TODO tn-review
  'sent.signInCta': 'Tsena go latela', // TODO tn-review
  'sent.moreTitle': 'O na le kakanyo e nngwe?', // TODO tn-review
  'sent.moreBody': 'Tlhola dikgwetlho tse di bulegileng. Dingwe di tla le dithuso tsa madi le kaelo.', // TODO tn-review
  'sent.moreCta': 'Bona dikgwetlho', // TODO tn-review
  'sent.missing': 'Ga re a bona kakanyo ya gago e e rometsweng mo tsebeng e', // TODO tn-review
  'sent.missingBody': 'Fa o rometse kakanyo, e babalesegile. Nomore ya gago ya tshupetso e mo molaetseng o re o go romeletseng, le mo Dikakanyong tsa me fa o na le akhaonto.', // TODO tn-review

  'news.over': 'Dikgang le makwalodikgang', // TODO tn-review
  'news.title': 'Se sesha mo boitshimololeding jwa CEDA', // TODO tn-review
  'news.sub': 'Dikgang, ditiragalo, malatsi a bofelo le dipoelo go tswa mo Botswana yotlhe, mo lefelong le le lengwe.', // TODO tn-review
  'news.search': 'Batla dikgang, ditiragalo le dikitsiso', // TODO tn-review
  'news.filters': 'Tlhopha ka mofuta', // TODO tn-review
  'filter.news': 'Dikgang', // TODO tn-review
  'news.sort': 'Rulaganya', // TODO tn-review
  'news.sortNewest': 'Tse dintšhwa', // TODO tn-review
  'news.sortOldest': 'Tsa bogologolo', // TODO tn-review
  'news.sortPopular': 'Tse di badilweng thata', // TODO tn-review
  'news.featured': 'E e tlhagisitsweng', // TODO tn-review
  'news.readStory': 'Bala kgang', // TODO tn-review
  'news.loadMore': 'Bona tse dingwe', // TODO tn-review
  'news.listTitle': 'Dikwalo tsa bosheng', // TODO tn-review
  'news.empty': 'Ga go ise go nne le sepe fa', // TODO tn-review
  'news.emptyBody': 'Leka mofuta o mongwe, kgotsa phimola go batla.', // TODO tn-review
  'news.emptySearch': 'Ga go na se se tshwanang le “{q}”', // TODO tn-review
  'news.clear': 'Phimola go batla', // TODO tn-review
  'news.loadError': 'Ga re a kgona go bula dikgang', // TODO tn-review
  'news.events': 'Ditiragalo tse di tlang', // TODO tn-review
  'news.noEvents': 'Ga go ise go rulaganngwe ditiragalo. Re di tsenya fa fela fa malatsi a beilwe.', // TODO tn-review
  'news.archive': 'Polokelo ya makwalodikgang', // TODO tn-review
  'news.noArchive': 'Kgatiso ya ntlha e mo tseleng.', // TODO tn-review
  'news.unread': 'Ga e ise e bulwe', // TODO tn-review
  'news.results': 'Dipoelo di le {n}', // TODO tn-review

  'ch.resultsOut': 'Dipoelo di tswile', // TODO tn-review
  'ch.window': 'Nako ya go tsenela e e dirisitsweng', // TODO tn-review
  'ch.seeChallenge': 'Bona kgwetlho', // TODO tn-review
  'chl.over': 'Dikgwetlho', // TODO tn-review
  'chl.title': 'Rarabolola bothata jwa nnete. Bona thuso ya nnete.', // TODO tn-review
  'chl.highlight': 'thuso ya nnete.', // TODO tn-review
  'chl.sub': 'CEDA le balekane ba tlhagisa dikgwetlho tse di nang le malatsi a bofelo, dikabelo le kaelo. Tlhopha e e go tshwanelang, kgotsa o romele kakanyo ya kakaretso nako nngwe le nngwe.', // TODO tn-review
  'chl.openNow': 'di bulegile', // TODO tn-review
  'chl.upcoming': 'di a tla', // TODO tn-review
  'chl.closedResults': 'di tswetswe di na le dipoelo', // TODO tn-review
  'chl.filter.open': 'Di bulegile', // TODO tn-review
  'chl.filter.upcoming': 'Di a tla', // TODO tn-review
  'chl.filter.closed': 'Di tswetswe', // TODO tn-review
  'chl.allSectors': 'Mafapha otlhe', // TODO tn-review
  'chl.sector': 'Lephata', // TODO tn-review
  'chl.sort': 'Rulaganya', // TODO tn-review
  'chl.sortClosing': 'Tse di tswalwang pele', // TODO tn-review
  'chl.sortNewest': 'Tse dintšhwa', // TODO tn-review
  'chl.filters': 'Ditlhopho', // TODO tn-review
  'chl.apply': 'Bontsha dikgwetlho', // TODO tn-review
  'chl.closedOver': 'Dikgwetlho tse di tswetsweng', // TODO tn-review
  'chl.closedTitle': 'Dipoelo di phasaladitswe', // TODO tn-review
  'chl.empty': 'Ga go na dikgwetlho fa jaanong', // TODO tn-review
  'chl.emptyBody': 'Dikgwetlho tse dintšhwa di tlhagisiwa mo botong ya dikitsiso. O ka romela kakanyo ya kakaretso nako nngwe le nngwe.', // TODO tn-review
  'chl.loadError': 'Ga re a kgona go bula dikgwetlho', // TODO tn-review
  'chl.statusFilter': 'Maemo a kgwetlho', // TODO tn-review
  'chl.listTitle': 'Dikgwetlho tsa jaanong', // TODO tn-review

  'chd.breadcrumb': 'Tsela', // TODO tn-review
  'chd.support': 'Thuso', // TODO tn-review
  'chd.closes': 'E tswalwa', // TODO tn-review
  'chd.opens': 'E bulwa', // TODO tn-review
  'chd.closedOn': 'E tswetswe', // TODO tn-review
  'chd.who': 'Ba ba ka tsenelang', // TODO tn-review
  'chd.where': 'Kae', // TODO tn-review
  'chd.sections': 'Mo tsebeng e', // TODO tn-review
  'chd.tab.overview': 'Kakaretso', // TODO tn-review
  'chd.tab.who': 'Ba ba ka tsenelang', // TODO tn-review
  'chd.tab.support': 'Thuso', // TODO tn-review
  'chd.tab.judge': 'Ka moo re atlholang', // TODO tn-review
  'chd.tab.dates': 'Malatsi', // TODO tn-review
  'chd.tab.faqs': 'Dipotso', // TODO tn-review
  'chd.lookingFor': 'Se re se batlang', // TODO tn-review
  'chd.whoTitle': 'Ba ba ka tsenelang', // TODO tn-review
  'chd.supportTitle': 'Thuso e e neelwang', // TODO tn-review
  'chd.judgeTitle': 'Ka moo re atlholang ka teng', // TODO tn-review
  'chd.judgeNote': 'Kakanyo nngwe le nngwe e tshwaiwa ka tsone, ka bokete jo.', // TODO tn-review
  'chd.datesTitle': 'Malatsi', // TODO tn-review
  'chd.faqTitle': 'Dipotso tse batho ba di botsang', // TODO tn-review
  'chd.closeIn': 'Go tsenela go tswalwa mo', // TODO tn-review
  'chd.openIn': 'Go tsenela go bulwa mo', // TODO tn-review
  'chd.days': 'malatsi', // TODO tn-review
  'chd.hours': 'diura', // TODO tn-review
  'chd.mins': 'metsotso', // TODO tn-review
  'chd.closesAt': 'E tswalwa {when}', // TODO tn-review
  'chd.opensAt': 'E bulwa {when}', // TODO tn-review
  'chd.closedAt': 'Go tsenela go tswetswe ka {when}', // TODO tn-review
  'chd.enter': 'Tsenela kgwetlho e', // TODO tn-review
  'chd.minutes': 'Ka metsotso e ka nna {n}. Kakanyetso ya gago e bolokwa fa o ntse o tsweletse.', // TODO tn-review
  'chd.questions': 'Dipotso? WhatsApp {number}', // TODO tn-review
  'chd.started': 'Batho ba le {n} ba simolotse go tsenela', // TODO tn-review
  'chd.startedOne': 'Motho a le 1 o simolotse go tsenela', // TODO tn-review
  'chd.partners': 'Ka tirisanommogo le', // TODO tn-review
  'chd.notFound': 'Ga re a bona kgwetlho e', // TODO tn-review
  'chd.notFoundBody': 'Gongwe e fetotswe leina kgotsa e tlositswe. Bona dikgwetlho tse di bulegileng jaanong.', // TODO tn-review
  'chd.allChallenges': 'Bona dikgwetlho tsotlhe', // TODO tn-review
  'chd.loadError': 'Ga re a kgona go bula kgwetlho e', // TODO tn-review
  'chd.notYet': 'Dintlha tsa karolo e di mo tseleng.', // TODO tn-review
  'chd.weight': '{n}% ya maduo', // TODO tn-review

  'pager.label': 'Ditsebe',
  'pager.previous': 'Morago',
  'pager.next': 'Pele',
  'pager.page': 'Tsebe {page}',
  'pager.of': 'Tsebe {page} go {total}',

  'steps.label': 'Kgatelopele',
  'steps.step': 'Kgato {n} go {total}',
  'steps.saved': 'Go bolokilwe',

  'nav.home': 'Gae',
  'nav.submit': 'Romela kakanyo',
  'nav.challenges': 'Dikgwetlho',
  'nav.news': 'Dikgang le makwalodikgang',
  'nav.stories': 'Dikgang tsa katlego',
  'nav.help': 'Thuso',
  'nav.myIdeas': 'Dikakanyo tsa me',
  'nav.websiteHome': 'Tsebe ya ntlha ya webosaete', // TODO tn-review
  'nav.profile': 'Porofaele',
  'nav.security': 'Tshireletso',
  'nav.staff': 'Kgolo ya badiri',
  'nav.main': 'Tsela e kgolo',

  'utility.official': 'Polatefomo ya semmuso ya Citizen Entrepreneurial Development Agency',
  'utility.whatsapp': 'WhatsApp {number}',
  'utility.helpCentre': 'Lefelo la thuso',
  'utility.accessibility': 'Phitlhelelo',

  'footer.tagline': 'Finance. Develop. Sustain.',
  'footer.explore': 'Polatefomo',
  'footer.support': 'Thuso',
  'footer.legal': 'Molao',
  'footer.otherWays': 'Ditsela tse dingwe',
  'footer.ussd': 'USSD {code}',
  'footer.offices': 'Etela ofisi ya CEDA',
  'footer.callCentre': 'Lefelo la megala',
  'footer.privacy': 'Sephiri',
  'footer.terms': 'Melawana',
  'footer.faq': 'Dipotso',
  'footer.about': 'Innovation Portal e tsamaisiwa ke CEDA go godisa dikakanyo tse di molemo go tswa mo makaleng otlhe le mo dikgaolong tsotlhe.',
  'footer.guidelines': 'Dikaelo',
  'footer.stories': 'Dikgang tsa katlego',
  'footer.howItWorks': 'Ka moo go dirang ka teng',
  'footer.criteria': 'Ditekanyetso tsa tshekatsheko',
  'footer.contact': 'Ikgolaganye le motlhankedi',
  'footer.cookies': 'Di-cookie',
  'footer.callCentreNumber': 'Lefelo la megala {number}',
  'tabs.label': 'Dikgolagano tse dipotlana',
  'tabs.news': 'Dikgang',
  'footer.rights': '© {year} Citizen Entrepreneurial Development Agency',
  ...innovatorTn,
}

export default tn
