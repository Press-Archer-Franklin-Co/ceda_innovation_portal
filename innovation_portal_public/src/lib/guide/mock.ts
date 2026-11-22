// DEV ONLY: a stand-in for POST /api/assistant/guide/ until the AI lane's API is on main. Loaded only when
// import.meta.env.DEV and VITE_GUIDE_MOCK=1 (see api.js), so the production build never contains it.
// It follows the contract: it only points at targets the page sent, and says "You don't have access" when the
// thing asked about is neither on the page nor in the person's menu. Keep it the same in both apps.

type Text = { en: string; tn: string }
const T = (en: string, tn: string): Text => ({ en, tn })
interface Recipe { ask: RegExp; entry: string; menu: string; goTo: Text; route: string; steps: { text: Text; target: string; done: string; doneTarget?: string }[]; intro?: Text }

const RECIPES: Recipe[] = [
  {
    ask: /(create|make|new|add).*(workflow)|workflow.*(create|new)|(dira|tlhama).*(workflow|tsamaiso)/i,
    entry: 'workflows.create',
    menu: '/workflows',
    goTo: T('Open Workflows in the menu.', 'Bula Workflows mo lenaneong.'),
    route: '/staff/admin/workflows',
    steps: [
      { text: T('Press Create workflow (highlighted).', 'Tobetsa Create workflow (e e tshwailweng).'), target: 'workflows.create', done: 'click' },
      { text: T('Give it a name and pick the challenge it belongs to, then press Create and open.', 'E neye leina o bo o tlhophe kgwetlho e e leng ya yona, morago o tobetse Create and open.'), target: 'workflows.name', done: 'click', doneTarget: 'workflows.createAndOpen' },
      { text: T('Add the stages and choose who does each one.', 'Tsenya dikgato o bo o tlhophe yo o dirang nngwe le nngwe.'), target: 'workflowBuilder.addStage', done: 'click' },
      { text: T('Press Check, then Publish. Publishing may need approval.', 'Tobetsa Check, morago Publish. Go phasalatsa go ka tlhoka tetlelelo.'), target: 'workflowBuilder.check', done: 'click' },
    ],
    intro: T('You are on Workflows. You can see, create and publish workflows.', 'O mo go Workflows. O ka bona, wa dira, wa phasalatsa di-workflow.'),
  },
  {
    ask: /(publish|create|make|new).*(form)|form.*(publish|create)|(phasalatsa|dira).*(foromo|form)/i,
    entry: 'forms.create',
    menu: '/forms',
    goTo: T('Open Forms in the menu.', 'Bula Forms mo lenaneong.'),
    route: '/staff/forms',
    steps: [
      { text: T('Press Create a form.', 'Tobetsa Create a form.'), target: 'forms.create', done: 'click' },
      { text: T('Add a step, then add the fields people fill in.', 'Tsenya kgato, morago o tsenye mafelo a batho ba a tlatsang.'), target: 'formBuilder.addField', done: 'click' },
      { text: T('Press Preview to see it as people will.', 'Tobetsa Preview go e bona jaaka batho ba tla e bona.'), target: 'formBuilder.preview', done: 'click' },
      { text: T('Press Publish when it is ready.', 'Tobetsa Publish fa e siametse.'), target: 'formBuilder.publish', done: 'click' },
    ],
  },
  {
    ask: /(send|move).*(panel)|panel|(ask|request).*(info|information)/i,
    entry: 'review.open',
    menu: '/review',
    goTo: T('Open Review queue in the menu.', 'Bula Review queue mo lenaneong.'),
    route: '/staff/review',
    steps: [
      { text: T('Open the idea you are reviewing.', 'Bula kakanyo e o e sekasekang.'), target: 'review.open', done: 'click' },
      { text: T('Press Send to panel when it is ready for judges.', 'Tobetsa Send to panel fa e siametse baatlhodi.'), target: 'review.sendToPanel', done: 'click' },
    ],
  },
  {
    ask: /(submit|send|share|new).*(idea)|(romela|tsenya).*(kakanyo)/i,
    entry: 'nav.submitIdea',
    menu: '/submit',
    goTo: T('Press Submit an idea at the top.', 'Tobetsa Submit an idea kwa godimo.'),
    route: '/submit',
    steps: [{ text: T('Press Submit an idea.', 'Tobetsa Submit an idea.'), target: 'nav.submitIdea', done: 'click' }],
  },
]

const WHAT_HERE = /what (do|can) i do|what is this|help me here|ke dira eng|ke ka dira eng|fa ke eng/i

function say(text: Text, lang: 'en' | 'tn') {
  return text[lang] ?? text.en
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mockGuide(body: any) {
  const lang = body.language === 'tn' ? 'tn' : 'en'
  const ids = new Set(body.targets.map((t: { id: string }) => t.id))
  const menu = body.menu ?? []
  const q = body.question ?? ''

  if (WHAT_HERE.test(q)) {
    type Tg = { id: string; label: string; kind: string }
    const fields = (body.targets as Tg[]).filter((t) => t.kind === 'field').slice(0, 2)
    const next = (body.targets as Tg[]).find((t) => /\.(next|check|submit|create|enter)$/i.test(t.id))
    const picked = [...fields, ...(next ? [next] : [])]
    const steps = picked.map((t, i) => ({
      id: `s${i + 1}`,
      text: t.kind === 'field'
        ? (lang === 'tn' ? `Araba "${t.label}".` : `Fill in "${t.label}".`)
        : (lang === 'tn' ? `Tobetsa "${t.label}".` : `Press "${t.label}".`),
      target_id: t.id,
      route: null,
      done_when: { type: t.kind === 'field' ? 'input' : 'click', target_id: t.id, route: null },
    }))
    return {
      answer: steps.length
        ? (lang === 'tn' ? `O mo go ${body.page_title}. A re tsamaye mmogo:` : `You are on ${body.page_title}. Let us go through it together:`)
        : (lang === 'tn' ? `O mo go ${body.page_title}.` : `You are on ${body.page_title}.`),
      language: lang,
      steps,
      sources: [],
      handoff_suggested: steps.length === 0,
    }
  }

  const recipe = RECIPES.find((r) => r.ask.test(q))
  if (!recipe) {
    return {
      answer: lang === 'tn' ? 'Ga ke na karabo e e siameng ya seo. O ka bua le motho.' : 'I do not have a good answer for that. You can talk to a person.',
      language: lang, steps: [], sources: [], handoff_suggested: true,
    }
  }
  const onPage = ids.has(recipe.entry)
  // On the right page but the control is not shown (workflows are built on a computer): say so, ring nothing.
  if (!onPage && body.route?.startsWith(recipe.route)) {
    return {
      answer: lang === 'tn' ? 'Se se dirwa ka khomputara. Bula tsebe e mo khomputareng go tswelela.' : 'This is done on a computer. Open this page on a computer to carry on.',
      language: lang, steps: [], sources: [], handoff_suggested: false,
    }
  }
  const inMenu = menu.some((m: { path: string }) => m.path.includes(recipe.menu))
  if (!onPage && !inMenu) {
    return {
      answer: lang === 'tn' ? 'Ga o na tetla ya go dira se. Kopa motsamaisi.' : "You don't have access to this. Ask an admin.",
      language: lang, steps: [], sources: [], handoff_suggested: false,
    }
  }
  const steps: { id: string; text: string; target_id: string | null; route: string | null; done_when: { type: string; target_id: string | null; route: string | null } }[] = recipe.steps.map((s, i) => ({
    id: `s${i + (onPage ? 1 : 2)}`,
    text: say(s.text, lang),
    target_id: s.target,
    route: null,
    done_when: { type: s.done, target_id: s.doneTarget ?? s.target, route: null },
  }))
  if (!onPage) {
    steps.unshift({ id: 's1', text: say(recipe.goTo, lang), target_id: null, route: recipe.route, done_when: { type: 'route', target_id: null, route: recipe.route } })
  }
  return {
    answer: recipe.intro && onPage ? say(recipe.intro, lang) : '',
    language: lang,
    steps,
    sources: [{ type: 'manual_page', id: 'mock', title: lang === 'tn' ? 'Kaedi ya tsebe e' : 'Help for this page' }],
    handoff_suggested: false,
  }
}
