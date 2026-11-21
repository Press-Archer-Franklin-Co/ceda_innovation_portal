// Strings for U11 part A: workflows (3.21a, 3.21, 3.22), the challenge builder sections (3.6b, 3.6c) and
// notifications and profile (3.39). Spread into en.js and tn.js.
//
// TODO tn-review: every Setswana string in programmesTn is a first draft and must be checked by a Setswana speaker
// at CEDA before launch.

export const programmesEn = {
  'wfl.crumb': 'Challenges / Workflows',
  'wfl.title': 'Workflows',
  'wfl.subtitle': 'The steps an idea goes through, who handles each step, and how it is marked.',
  'wfl.create': 'Create workflow',
  'wfl.phoneNote': 'Creating and building workflows is done on a computer.',
  'wfl.loadError': 'We could not load the workflows',
  'wfl.empty': 'No workflows yet',
  'wfl.emptyBody': 'A workflow sets the steps an idea goes through. Start from a template.',
  'wfl.menu': 'Actions for {name}',
  'wfl.open': 'Open',
  'wfl.duplicate': 'Duplicate',
  'wfl.duplicated': 'Made a copy of "{name}".',
  'wfl.seeIdeas': 'See ideas in it',
  'wfl.activate': 'Make it the one in use',
  'wfl.activated': '"{name}" is now in use.',
  'wfl.archive': 'Archive',
  'wfl.archived': 'Archived "{name}".',
  'wfl.archiveTitle': 'Archive "{name}"?',
  'wfl.archiveBody': 'Ideas already in it carry on. It can no longer be picked for a challenge.',
  'wfl.usedByValue': 'Used by: {list}',
  'wfl.notUsed': 'Not used by a challenge yet',
  'wfl.stepsCount': '{n} steps',
  'wfl.generalIdeas': 'General ideas',
  'wfl.createTitle': 'Create a workflow',
  'wfl.stepHow': 'How to start',
  'wfl.stepName': 'Name and use',
  'wfl.howToStart': 'How to start',
  'wfl.fromTemplate': 'From a template',
  'wfl.fromTemplateHint': 'Ready-made steps you can change',
  'wfl.fromScratch': 'From scratch',
  'wfl.fromScratchHint': 'Start with an empty canvas',
  'wfl.copyOne': 'Copy one you have',
  'wfl.copyOneHint': 'Start from an existing workflow',
  'wfl.templates': 'Templates',
  'wfl.templatesMissing': 'Templates are not available yet. Start from scratch or copy a workflow you have.',
  'wfl.pickTemplate': 'Choose a template.',
  'wfl.copyWhich': 'Which workflow to copy',
  'wfl.pickCopy': 'Choose the workflow to copy.',
  'wfl.copyName': 'Copy of {name}',
  'wfl.name': 'Name',
  'wfl.nameNeeded': 'Give the workflow a name.',
  'wfl.usedBy': 'Used by',
  'wfl.usedByHint': 'The challenge, or general ideas, whose ideas follow this workflow.',
  'wfl.chooseProgram': 'Choose…',
  'wfl.programNeeded': 'Choose what uses this workflow.',
  'wfl.next': 'Next',
  'wfl.back': 'Back',
  'wfl.createAndOpen': 'Create and open',
  'wfl.createError': 'We could not create the workflow.',
  'wfi.title': 'Ideas in this workflow',
  'wfi.subtitle': 'Where every idea is right now, and where they get stuck.',
  'wfi.view': 'View',
  'wfi.board': 'Board',
  'wfi.table': 'Table',
  'wfi.steps': 'Steps',
  'wfi.waitTitle': 'Average days waiting per step',
  'wfi.waitHint': 'Last 30 days',
  'wfi.days': '{n} days',
  'wfi.done': 'Done',
  'wfi.empty': 'No ideas in this workflow yet',
  'wfi.emptyBody': 'Ideas appear here as soon as they are sent to the challenge that uses it.',
  'wfi.loadError': 'We could not load the ideas in this workflow',
  'wfi.notYet': 'The board is not available yet',
  'wfi.notYetBody': 'You can see the same ideas in the submissions list for this challenge.',
  'wfi.openList': 'Open the submissions list',
  'wfb.subtitle': 'Click a step to say who has it, what they do and how it is marked.',
  'wfb.phoneNote': 'You can read the flow here. Building is done on a computer.',
  'wfb.loadError': 'We could not load this workflow',
  'wfb.check': 'Check the workflow',
  'wfb.checkPassed': 'The workflow is ready.',
  'wfb.checkFailed': 'The workflow needs a few fixes.',
  'wfb.publish': 'Publish',
  'wfb.published': 'Published. Make it the one in use when you are ready.',
  'wfb.activated': 'This workflow is now in use.',
  'wfb.saved': 'Saved.',
  'wfb.addStep': 'Add a step',
  'wfb.palette.form': 'Applicant form',
  'wfb.palette.officer': 'Officer review',
  'wfb.palette.panel': 'Panel scoring',
  'wfb.palette.askInfo': 'Ask for more info',
  'wfb.palette.decision': 'Decision',
  'wfb.added': 'Added "{name}". Set it up on the right.',
  'wfb.empty': 'No steps yet',
  'wfb.emptyBody': 'Add the first step from the list on the left.',
  'wfb.untitled': 'Untitled step',
  'wfb.off': 'Off',
  'wfb.needsSetup': 'Needs setting up',
  'wfb.who': 'Who',
  'wfb.does': 'Does',
  'wfb.marking': 'Marking',
  'wfb.markingNotSet': 'Not set yet',
  'wfb.markingValue': '{name} · pass {pass}',
  'wfb.anyone': 'Anyone with access',
  'wfb.whoAssigned': '{n} × {role}',
  'wfb.noButtons': 'No buttons yet',
  'wfb.moveUp': 'Move "{name}" up',
  'wfb.moveDown': 'Move "{name}" down',
  'wfb.plainWords': 'In plain words',
  'wfb.plainFirst': 'First, {name}: {who}{scoring}.',
  'wfb.plainNext': 'Then {name}: {who}{scoring}.',
  'wfb.plainScored': ', scored with marking criteria',
  'wfb.stepSettings': 'Step settings',
  'wfb.issue.name': 'Give the step a name',
  'wfb.issue.buttons': 'Choose at least one button',
  'wfb.issue.who': 'Choose who is assigned',
  'wfb.issue.howMany': 'Assign at least one person',
  'wfb.issue.scorers': 'At least one person must score',
  'wfb.stepName': 'Step name',
  'wfb.stepOn': 'This step is on',
  'wfb.whoHasIt': 'Who has it',
  'wfb.role': 'Role',
  'wfb.assignPeople': 'Give it to named people',
  'wfb.assignPeopleHint': 'Each idea is assigned to people with this role.',
  'wfb.assignTo': 'Assign to',
  'wfb.howMany': 'How many per idea',
  'wfb.shareOut': 'How the work is shared',
  'wfb.shareOutHint': 'Whether people work one after another or at the same time.',
  'wfb.minDone': 'How many must finish',
  'wfb.whatTheyDo': 'What they do',
  'wfb.buttonsHint': 'The buttons they get on the idea.',
  'wfb.statusAfter': 'Status the idea shows',
  'wfb.noStatus': 'Keep the current status',
  'wfb.markingCriteria': 'Marking criteria',
  'wfb.scoreWithCriteria': 'Score with marking criteria',
  'wfb.scoreOn': 'On: each person scores the idea against a criteria set.',
  'wfb.scoreOff': 'Off: people use the buttons only.',
  'wfb.criteriaSet': 'Criteria set',
  'wfb.chooseSet': 'Choose a set…',
  'wfb.setNeeded': 'Choose the criteria set for this step.',
  'wfb.manageCriteria': 'Open marking criteria',
  'wfb.scorers': 'People who score',
  'wfb.combine': 'How scores combine',
  'wfb.passMark': 'Pass mark (out of 100)',
  'wfb.rejectBelow': 'Not taken forward below',
  'wfb.betweenNote': 'Between {low} and {high}, the idea goes back for changes.',
  'wfb.blind': 'Scorers cannot see each other’s scores',
  'wfb.feedback': 'Share the feedback with the applicant',
  'wfb.timeLimit': 'Time limit and order',
  'wfb.dueHours': 'Time limit (hours)',
  'wfb.dueHoursHint': 'After this the step shows as overdue.',
  'wfb.position': 'Position',
  'wfb.positionN': 'Step {n}',
  'wfb.remove': 'Remove step',
  'wfb.removeTitle': 'Remove the step "{name}"?',
  'wfb.removeBody': 'This cannot be undone.',
  'wfb.removed': 'Removed "{name}".',
  'wfb.saveStep': 'Save step',
  'wfb.stepSaved': 'Saved "{name}".',
  'wfb.discardTitle': 'Discard your step changes?',
  'wfb.discardBody': 'You have changes to this step that are not saved.',
  'wfb.discard': 'Discard changes',
  'wfb.keepEditing': 'Keep editing',
  'wfb.details': 'Workflow details',
  'wfb.detailsHint': 'Click a step to set it up. The name shows wherever this workflow is chosen.',
  'wfb.description': 'Description',
  'wfb.role.innovator': 'The applicant',
  'wfb.role.innovation_officer': 'Innovation officers',
  'wfb.role.innovation_manager': 'Innovation managers',
  'wfb.role.judge': 'Judges',
  'wfb.role.specialist': 'Specialists',
  'wfb.role.mentor': 'Mentors',
  'wfb.role.administrator': 'Administrators',
  'wfb.assignRole.reviewer': 'reviewer',
  'wfb.assignRole.officer': 'officer',
  'wfb.assignRole.manager': 'manager',
  'wfb.assignRole.judge': 'judge',
  'wfb.assignRole.specialist': 'specialist',
  'wfb.assignRole.mentor': 'mentor',
  'wfb.assignRole.analyst': 'analyst',
  'wfb.assignRole.staff': 'staff member',
  'wfb.assignRole.exo': 'EXO',
  'wfb.mode.sequential': 'One after another',
  'wfb.mode.parallel_all': 'At the same time, everyone finishes',
  'wfb.mode.parallel_any': 'At the same time, the first one decides',
  'wfb.mode.parallel_minimum': 'At the same time, enough finish',
  'wfb.action.approve': 'Move on',
  'wfb.action.return': 'Send back for changes',
  'wfb.action.reject': 'Not taken forward',
  'wfb.agg.average': 'Average',
  'wfb.agg.min': 'Lowest',
  'wfb.agg.max': 'Highest',
  'wfb.agg.median': 'Middle',
  'wfb.status.submitted': 'Submitted',
  'wfb.status.screening': 'Screening',
  'wfb.status.under_review': 'In review',
  'wfb.status.assigned_to_judges': 'With the judges',
  'wfb.status.under_judging': 'Being judged',
  'wfb.status.approved': 'Approved',
  'wfb.status.rejected': 'Not taken forward',
  'wfb.status.finalist': 'Finalist',
  'wfb.status.winner': 'Winner',
  'wfb.status.selected_for_hackathon': 'Selected for the hackathon',
}

export const programmesTn = {
  'wfl.crumb': 'Dikgwetlho / Ditsamaiso', // TODO tn-review
  'wfl.title': 'Ditsamaiso', // TODO tn-review
  'wfl.subtitle': 'Dikgato tse kakanyo e di fetang, yo o tshwarang kgato nngwe le nngwe, le kafa e tshwaiwang ka teng.', // TODO tn-review
  'wfl.create': 'Dira tsamaiso', // TODO tn-review
  'wfl.phoneNote': 'Go dira le go aga ditsamaiso go dirwa ka khomputara.', // TODO tn-review
  'wfl.loadError': 'Ga re a kgona go bula ditsamaiso', // TODO tn-review
  'wfl.empty': 'Ga go ise go nne le ditsamaiso', // TODO tn-review
  'wfl.emptyBody': 'Tsamaiso e baya dikgato tse kakanyo e di fetang. Simolola ka sekao.', // TODO tn-review
  'wfl.menu': 'Ditiro tsa {name}', // TODO tn-review
  'wfl.open': 'Bula', // TODO tn-review
  'wfl.duplicate': 'Dira khopi', // TODO tn-review
  'wfl.duplicated': 'Khopi ya "{name}" e dirilwe.', // TODO tn-review
  'wfl.seeIdeas': 'Bona dikakanyo tse di mo go yone', // TODO tn-review
  'wfl.activate': 'E dire e e dirisiwang', // TODO tn-review
  'wfl.activated': '"{name}" jaanong e a dirisiwa.', // TODO tn-review
  'wfl.archive': 'Boloka mo polokelong', // TODO tn-review
  'wfl.archived': '"{name}" e bolokilwe mo polokelong.', // TODO tn-review
  'wfl.archiveTitle': 'Boloka "{name}" mo polokelong?', // TODO tn-review
  'wfl.archiveBody': 'Dikakanyo tse di setseng di le mo go yone di a tswelela. Ga e kitla e tlhophiwa gape kgwetlhong.', // TODO tn-review
  'wfl.usedByValue': 'E dirisiwa ke: {list}', // TODO tn-review
  'wfl.notUsed': 'Ga e ise e dirisiwe ke kgwetlho', // TODO tn-review
  'wfl.stepsCount': 'Dikgato di le {n}', // TODO tn-review
  'wfl.generalIdeas': 'Dikakanyo tse di akaretsang', // TODO tn-review
  'wfl.createTitle': 'Dira tsamaiso', // TODO tn-review
  'wfl.stepHow': 'Go simolola jang', // TODO tn-review
  'wfl.stepName': 'Leina le tiriso', // TODO tn-review
  'wfl.howToStart': 'Go simolola jang', // TODO tn-review
  'wfl.fromTemplate': 'Go tswa sekaong', // TODO tn-review
  'wfl.fromTemplateHint': 'Dikgato tse di setseng di siametse tse o ka di fetolang', // TODO tn-review
  'wfl.fromScratch': 'Go simolola fa tshimologong', // TODO tn-review
  'wfl.fromScratchHint': 'Simolola ka lefelo le le lolea', // TODO tn-review
  'wfl.copyOne': 'Dira khopi ya e o nang le yone', // TODO tn-review
  'wfl.copyOneHint': 'Simolola ka tsamaiso e e leng teng', // TODO tn-review
  'wfl.templates': 'Dikao', // TODO tn-review
  'wfl.templatesMissing': 'Dikao ga di ise di nne teng. Simolola fa tshimologong kgotsa dira khopi ya tsamaiso e o nang le yone.', // TODO tn-review
  'wfl.pickTemplate': 'Tlhopha sekao.', // TODO tn-review
  'wfl.copyWhich': 'Tsamaiso efe e o dirang khopi ya yone', // TODO tn-review
  'wfl.pickCopy': 'Tlhopha tsamaiso e o dirang khopi ya yone.', // TODO tn-review
  'wfl.copyName': 'Khopi ya {name}', // TODO tn-review
  'wfl.name': 'Leina', // TODO tn-review
  'wfl.nameNeeded': 'Naya tsamaiso leina.', // TODO tn-review
  'wfl.usedBy': 'E dirisiwa ke', // TODO tn-review
  'wfl.usedByHint': 'Kgwetlho, kgotsa dikakanyo tse di akaretsang, tse dikakanyo tsa tsone di latelang tsamaiso e.', // TODO tn-review
  'wfl.chooseProgram': 'Tlhopha…', // TODO tn-review
  'wfl.programNeeded': 'Tlhopha se se dirisang tsamaiso e.', // TODO tn-review
  'wfl.next': 'E e latelang', // TODO tn-review
  'wfl.back': 'Boela morago', // TODO tn-review
  'wfl.createAndOpen': 'Dira o bo o bula', // TODO tn-review
  'wfl.createError': 'Ga re a kgona go dira tsamaiso.', // TODO tn-review
  'wfi.title': 'Dikakanyo mo tsamaisong e', // TODO tn-review
  'wfi.subtitle': 'Kwa kakanyo nngwe le nngwe e leng teng jaanong, le kwa di emang teng.', // TODO tn-review
  'wfi.view': 'Tebo', // TODO tn-review
  'wfi.board': 'Boto', // TODO tn-review
  'wfi.table': 'Tafole', // TODO tn-review
  'wfi.steps': 'Dikgato', // TODO tn-review
  'wfi.waitTitle': 'Palogare ya malatsi a go leta mo kgatong nngwe le nngwe', // TODO tn-review
  'wfi.waitHint': 'Malatsi a le 30 a a fetileng', // TODO tn-review
  'wfi.days': 'Malatsi a le {n}', // TODO tn-review
  'wfi.done': 'Di weditswe', // TODO tn-review
  'wfi.empty': 'Ga go ise go nne le dikakanyo mo tsamaisong e', // TODO tn-review
  'wfi.emptyBody': 'Dikakanyo di bonala fa fela fa di romelwa kgwetlhong e e e dirisang.', // TODO tn-review
  'wfi.loadError': 'Ga re a kgona go bula dikakanyo mo tsamaisong e', // TODO tn-review
  'wfi.notYet': 'Boto ga e ise e nne teng', // TODO tn-review
  'wfi.notYetBody': 'O ka bona dikakanyo tse di tshwanang mo lenaneong la dikopo la kgwetlho e.', // TODO tn-review
  'wfi.openList': 'Bula lenaane la dikopo', // TODO tn-review
  'wfb.subtitle': 'Tobetsa kgato go bolela gore ke mang yo o nang le yone, ba dira eng le gore e tshwaiwa jang.', // TODO tn-review
  'wfb.phoneNote': 'O ka bala tsamaiso fa. Go aga go dirwa ka khomputara.', // TODO tn-review
  'wfb.loadError': 'Ga re a kgona go bula tsamaiso e', // TODO tn-review
  'wfb.check': 'Tlhola tsamaiso', // TODO tn-review
  'wfb.checkPassed': 'Tsamaiso e siametse.', // TODO tn-review
  'wfb.checkFailed': 'Tsamaiso e tlhoka diphetolo di le mmalwa.', // TODO tn-review
  'wfb.publish': 'Phasalatsa', // TODO tn-review
  'wfb.published': 'E phasaladitswe. E dire e e dirisiwang fa o ipaakantse.', // TODO tn-review
  'wfb.activated': 'Tsamaiso e jaanong e a dirisiwa.', // TODO tn-review
  'wfb.saved': 'E bolokilwe.', // TODO tn-review
  'wfb.addStep': 'Tsenya kgato', // TODO tn-review
  'wfb.palette.form': 'Foromo ya mokopi', // TODO tn-review
  'wfb.palette.officer': 'Tshekatsheko ya motlhankedi', // TODO tn-review
  'wfb.palette.panel': 'Go tshwaya ga phanele', // TODO tn-review
  'wfb.palette.askInfo': 'Kopa tshedimosetso e nngwe', // TODO tn-review
  'wfb.palette.decision': 'Tshwetso', // TODO tn-review
  'wfb.added': '"{name}" e tsentswe. E rulaganye ka fa mojeng.', // TODO tn-review
  'wfb.empty': 'Ga go ise go nne le dikgato', // TODO tn-review
  'wfb.emptyBody': 'Tsenya kgato ya ntlha go tswa mo lenaneong le le kafa molemeng.', // TODO tn-review
  'wfb.untitled': 'Kgato e e senang leina', // TODO tn-review
  'wfb.off': 'E tsamaile', // TODO tn-review
  'wfb.needsSetup': 'E tlhoka go rulaganngwa', // TODO tn-review
  'wfb.who': 'Mang', // TODO tn-review
  'wfb.does': 'Dira', // TODO tn-review
  'wfb.marking': 'Go tshwaya', // TODO tn-review
  'wfb.markingNotSet': 'Ga e ise e beiwe', // TODO tn-review
  'wfb.markingValue': '{name} · go feta {pass}', // TODO tn-review
  'wfb.anyone': 'Mongwe le mongwe yo o nang le phitlhelelo', // TODO tn-review
  'wfb.whoAssigned': '{n} × {role}', // TODO tn-review
  'wfb.noButtons': 'Ga go ise go nne le dikonopo', // TODO tn-review
  'wfb.moveUp': 'Tsholetsa "{name}"', // TODO tn-review
  'wfb.moveDown': 'Fokotsa "{name}"', // TODO tn-review
  'wfb.plainWords': 'Ka mafoko a a motlhofo', // TODO tn-review
  'wfb.plainFirst': 'Sa ntlha, {name}: {who}{scoring}.', // TODO tn-review
  'wfb.plainNext': 'Morago {name}: {who}{scoring}.', // TODO tn-review
  'wfb.plainScored': ', ka ditekanyetso tsa go tshwaya', // TODO tn-review
  'wfb.stepSettings': 'Dithulaganyo tsa kgato', // TODO tn-review
  'wfb.issue.name': 'Naya kgato leina', // TODO tn-review
  'wfb.issue.buttons': 'Tlhopha bonnye konopo e le nngwe', // TODO tn-review
  'wfb.issue.who': 'Tlhopha yo o abelwang', // TODO tn-review
  'wfb.issue.howMany': 'Abela bonnye motho a le mongwe', // TODO tn-review
  'wfb.issue.scorers': 'Bonnye motho a le mongwe o tshwanetse go tshwaya', // TODO tn-review
  'wfb.stepName': 'Leina la kgato', // TODO tn-review
  'wfb.stepOn': 'Kgato e e a dira', // TODO tn-review
  'wfb.whoHasIt': 'Ke mang yo o nang le yone', // TODO tn-review
  'wfb.role': 'Seabe', // TODO tn-review
  'wfb.assignPeople': 'E neela batho ba ba itsiweng', // TODO tn-review
  'wfb.assignPeopleHint': 'Kakanyo nngwe le nngwe e abelwa batho ba ba nang le seabe se.', // TODO tn-review
  'wfb.assignTo': 'Abela', // TODO tn-review
  'wfb.howMany': 'Ba le kae mo kakanyong nngwe', // TODO tn-review
  'wfb.shareOut': 'Kafa tiro e abelanwang ka teng', // TODO tn-review
  'wfb.shareOutHint': 'Gore batho ba dira ka tatelano kgotsa ka nako e le nngwe.', // TODO tn-review
  'wfb.minDone': 'Ba le kae ba tshwanetse go fetsa', // TODO tn-review
  'wfb.whatTheyDo': 'Ba dira eng', // TODO tn-review
  'wfb.buttonsHint': 'Dikonopo tse ba di bonang mo kakanyong.', // TODO tn-review
  'wfb.statusAfter': 'Seemo se kakanyo e se bontshang', // TODO tn-review
  'wfb.noStatus': 'Tsaya seemo sa jaanong', // TODO tn-review
  'wfb.markingCriteria': 'Ditekanyetso tsa go tshwaya', // TODO tn-review
  'wfb.scoreWithCriteria': 'Tshwaya ka ditekanyetso', // TODO tn-review
  'wfb.scoreOn': 'E bulegile: motho mongwe le mongwe o tshwaya kakanyo go ya ka ditekanyetso.', // TODO tn-review
  'wfb.scoreOff': 'E tswetswe: batho ba dirisa dikonopo fela.', // TODO tn-review
  'wfb.criteriaSet': 'Setlhopha sa ditekanyetso', // TODO tn-review
  'wfb.chooseSet': 'Tlhopha setlhopha…', // TODO tn-review
  'wfb.setNeeded': 'Tlhopha setlhopha sa ditekanyetso sa kgato e.', // TODO tn-review
  'wfb.manageCriteria': 'Bula ditekanyetso tsa go tshwaya', // TODO tn-review
  'wfb.scorers': 'Batho ba ba tshwayang', // TODO tn-review
  'wfb.combine': 'Kafa maduo a kopanngwang ka teng', // TODO tn-review
  'wfb.passMark': 'Maduo a go feta (go 100)', // TODO tn-review
  'wfb.rejectBelow': 'Ga e tswelediwe fa tlase ga', // TODO tn-review
  'wfb.betweenNote': 'Magareng ga {low} le {high}, kakanyo e busediwa go fetolwa.', // TODO tn-review
  'wfb.blind': 'Batshwai ga ba bone maduo a ba bangwe', // TODO tn-review
  'wfb.feedback': 'Abelana dikakgelo le mokopi', // TODO tn-review
  'wfb.timeLimit': 'Nako le tatelano', // TODO tn-review
  'wfb.dueHours': 'Nako (diura)', // TODO tn-review
  'wfb.dueHoursHint': 'Morago ga nako e kgato e bontsha e fetile nako.', // TODO tn-review
  'wfb.position': 'Maemo', // TODO tn-review
  'wfb.positionN': 'Kgato {n}', // TODO tn-review
  'wfb.remove': 'Tlosa kgato', // TODO tn-review
  'wfb.removeTitle': 'Tlosa kgato "{name}"?', // TODO tn-review
  'wfb.removeBody': 'Se ga se kgone go busediwa.', // TODO tn-review
  'wfb.removed': '"{name}" e tlositswe.', // TODO tn-review
  'wfb.saveStep': 'Boloka kgato', // TODO tn-review
  'wfb.stepSaved': '"{name}" e bolokilwe.', // TODO tn-review
  'wfb.discardTitle': 'Latlha diphetolo tsa kgato?', // TODO tn-review
  'wfb.discardBody': 'O na le diphetolo mo kgatong e tse di sa bolokwang.', // TODO tn-review
  'wfb.discard': 'Latlha diphetolo', // TODO tn-review
  'wfb.keepEditing': 'Tswelela o fetola', // TODO tn-review
  'wfb.details': 'Dintlha tsa tsamaiso', // TODO tn-review
  'wfb.detailsHint': 'Tobetsa kgato go e rulaganya. Leina le bonala gongwe le gongwe fa tsamaiso e tlhophiwa.', // TODO tn-review
  'wfb.description': 'Tlhaloso', // TODO tn-review
  'wfb.role.innovator': 'Mokopi', // TODO tn-review
  'wfb.role.innovation_officer': 'Batlhankedi ba boitlhamedi', // TODO tn-review
  'wfb.role.innovation_manager': 'Batsamaisi ba boitlhamedi', // TODO tn-review
  'wfb.role.judge': 'Baatlhodi', // TODO tn-review
  'wfb.role.specialist': 'Baitseanape', // TODO tn-review
  'wfb.role.mentor': 'Bakaedi', // TODO tn-review
  'wfb.role.administrator': 'Batsamaisi', // TODO tn-review
  'wfb.assignRole.reviewer': 'motshekatsheki', // TODO tn-review
  'wfb.assignRole.officer': 'motlhankedi', // TODO tn-review
  'wfb.assignRole.manager': 'motsamaisi', // TODO tn-review
  'wfb.assignRole.judge': 'moatlhodi', // TODO tn-review
  'wfb.assignRole.specialist': 'moitseanape', // TODO tn-review
  'wfb.assignRole.mentor': 'mokaedi', // TODO tn-review
  'wfb.assignRole.analyst': 'mosekaseki', // TODO tn-review
  'wfb.assignRole.staff': 'modiri', // TODO tn-review
  'wfb.assignRole.exo': 'EXO', // TODO tn-review
  'wfb.mode.sequential': 'Mongwe morago ga yo mongwe', // TODO tn-review
  'wfb.mode.parallel_all': 'Ka nako e le nngwe, botlhe ba a fetsa', // TODO tn-review
  'wfb.mode.parallel_any': 'Ka nako e le nngwe, wa ntlha o a swetsa', // TODO tn-review
  'wfb.mode.parallel_minimum': 'Ka nako e le nngwe, ba ba lekaneng ba a fetsa', // TODO tn-review
  'wfb.action.approve': 'Tswelela', // TODO tn-review
  'wfb.action.return': 'Busetsa go fetolwa', // TODO tn-review
  'wfb.action.reject': 'Ga e tswelediwe', // TODO tn-review
  'wfb.agg.average': 'Palogare', // TODO tn-review
  'wfb.agg.min': 'E e kwa tlase', // TODO tn-review
  'wfb.agg.max': 'E e kwa godimo', // TODO tn-review
  'wfb.agg.median': 'Ya magareng', // TODO tn-review
  'wfb.status.submitted': 'E rometswe', // TODO tn-review
  'wfb.status.screening': 'Tlhatlhobo', // TODO tn-review
  'wfb.status.under_review': 'E a sekasekwa', // TODO tn-review
  'wfb.status.assigned_to_judges': 'E kwa baatlhoding', // TODO tn-review
  'wfb.status.under_judging': 'E a atlholwa', // TODO tn-review
  'wfb.status.approved': 'E amogetswe', // TODO tn-review
  'wfb.status.rejected': 'Ga e tswelediwe', // TODO tn-review
  'wfb.status.finalist': 'Mofenyi wa bofelo', // TODO tn-review
  'wfb.status.winner': 'Mofenyi', // TODO tn-review
  'wfb.status.selected_for_hackathon': 'E tlhophetswe hackathon', // TODO tn-review
}
