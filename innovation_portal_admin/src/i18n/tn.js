// Setswana strings for staff console chrome. First draft: needs review by a Setswana speaker at CEDA.
import { challengesTn } from './challenges'
import { rolesTn } from './roles'
import { contentTn } from './content'
import { dashboardTn } from './dashboard'
import { u7Tn } from './u7'
import { formsTn } from './forms'
import { ideasTn } from './ideas'
import { programmesTn } from './programmes'
import { conversationsTn } from './conversations'
import { reviewTn } from './review'
import { contentBTn } from './contentB'
import { guideTn } from './guide'
import { channelsTn } from './channels'

const tn = {
  'lang.en': 'English',
  'lang.tn': 'Setswana',
  'lang.label': 'Puo',
  'common.close': 'Tswala',
  'access.noPageTitle': 'Tsebe e ga se karolo ya tiro ya gago', // TODO tn-review
  'access.noPageBody': 'Kopa motsamaisi fa o e tlhoka.', // TODO tn-review
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

  'table.selectAll': 'Tlhopha mela yotlhe', // TODO tn-review
  'table.selectRow': 'Tlhopha mola', // TODO tn-review
  'table.search': 'Batla mo lenaaneng le', // TODO tn-review

  'error.page': 'Tsebe e e ga e a kgona go bulega', // TODO tn-review
  'error.pageBody': 'Bothata bo kwa go rona. Tiro ya gago e babalesegile. Leka gape morago ga nakwana.', // TODO tn-review
  'error.newVersion': 'Go na le kgatiso e ntšhwa ya kgolo', // TODO tn-review
  'error.newVersionBody': 'Simolola sesha go bona kgatiso ya bosheng. Se o se bolokileng se a bolokwa.', // TODO tn-review
  'error.reload': 'Simolola sesha', // TODO tn-review

  'partner.add': 'Oketsa molekane', // TODO tn-review
  'partner.addBody': 'Balekane ba bonala mo moleng wa tsebe ya ntlha. O ka ba fitlha nako nngwe le nngwe.', // TODO tn-review
  'partner.name': 'Leina la mokgatlho', // TODO tn-review
  'partner.nameHint': 'Jaaka le tshwanetse go bonala mo webosaeteng', // TODO tn-review
  'partner.website': 'Webosaete', // TODO tn-review
  'partner.logo': 'Letshwao', // TODO tn-review
  'partner.logoHint': 'PNG kgotsa SVG, go fitlha go 2 MB. Re a le kgaola gore le lekane.', // TODO tn-review
  'partner.save': 'Boloka molekane', // TODO tn-review
  'partner.saved': 'Molekane o bolokilwe', // TODO tn-review
  'partner.savedBody': '{name} jaanong o bonala mo lenaaneng la balekane.', // TODO tn-review
  'partner.undo': 'Busetsa', // TODO tn-review
  'partner.nameError': 'Tsenya leina la mokgatlho.', // TODO tn-review
  'partner.urlError': 'Tsenya aterese e e feletseng, e simolola ka https://', // TODO tn-review
  'partner.fileError': 'Letshwao le feta 2 MB. Tlhopha faele e nnye.', // TODO tn-review
  'partner.saveError': 'Ga re a kgona go boloka molekane. Leka gape.', // TODO tn-review

  'pager.label': 'Ditsebe',
  'pager.previous': 'Morago',
  'pager.next': 'Pele',
  'pager.page': 'Tsebe {page}',
  'pager.of': 'Tsebe {page} go {total}',
  'steps.label': 'Kgatelopele',
  'steps.step': 'Kgato {n} go {total}',
  'steps.saved': 'Go bolokilwe',
  'staff.group.overview': 'Kakaretso',
  'staff.group.challenges': 'Dikgwetlho',
  'staff.group.website': 'Diteng tsa webosaete',
  'staff.group.admin': 'Botsamaisi',
  'staff.nav.dashboard': 'Letlapa la tshedimosetso',
  'staff.nav.reports': 'Dipegelo',
  'staff.nav.reviewQueue': 'Mola wa tshekatsheko',
  'staff.nav.myWork': 'Tiro ya me',
  'staff.nav.challenges': 'Dikgwetlho',
  'staff.nav.criteria': 'Ditekanyetso tsa go tshwaya',
  'staff.nav.forms': 'Moagi wa diforomo',
  'staff.nav.home': 'Tsebe ya ntlha',
  'staff.nav.news': 'Dikgang le makwalodikgang',
  'staff.nav.stories': 'Dikgang tsa katlego',
  'staff.nav.quotes': 'Mafoko a boeteledipele',
  'staff.nav.partners': 'Balekane le baemaruri',
  'staff.nav.faqs': 'Dipotso tse di botsiwang gantsi',
  'staff.nav.users': 'Badirisi le maemo',
  'staff.nav.settings': 'Dithulaganyo',
  'staff.nav.platform': 'Dithulaganyo tsa polatefomo',
  'staff.nav.audit': 'Rekoto ya tlhatlhobo',
  'staff.nav.workflows': 'Ditsamaiso tsa tiro',
  'staff.nav.terms': 'Melawana',
  'staff.nav.label': 'Lenaane la badiri',
  'staff.search': 'Batla dikakanyo, dikgwetlho le batho',
  'staff.viewSite': 'Bona webosaete ya setšhaba',
  'staff.collapse': 'Fitlha lenaane',
  'staff.expand': 'Bontsha lenaane',
  'staff.console': 'Kgolo ya badiri',
  // Crop dialog (components/ui/ImageCropModal)
  'crop.title': 'Baya le go sega setshwantsho', // TODO tn-review
  'crop.help': 'Goga setshwantsho go se baya, o dirise selaodi go se godisa. Lebokose le bontsha sentle se batho ba tla se bonang.', // TODO tn-review
  'crop.drag': 'Goga go se baya', // TODO tn-review
  'crop.zoom': 'Godisa', // TODO tn-review
  'crop.apply': 'Dirisa go sega', // TODO tn-review
  'crop.loadError': 'Setshwantsho se ga se a kgona go bulwa gore se segwe.', // TODO tn-review
  'crop.createError': 'Ga re a kgona go dira setshwantsho se se segilweng. Tsweetswee leka gape.', // TODO tn-review
  'crop.taintedError': 'Setshwantsho se ga se kgone go segelwa fano. Tsenya faele ya ntlha gape mme o e sege pele o boloka.', // TODO tn-review
  ...formsTn,
  ...ideasTn,
  ...programmesTn,
  ...conversationsTn,
  ...reviewTn,
  ...contentBTn,
  ...guideTn,
  ...channelsTn,
  ...challengesTn,
  ...rolesTn,
  ...contentTn,
  ...dashboardTn,
  ...u7Tn,
}

export default tn
