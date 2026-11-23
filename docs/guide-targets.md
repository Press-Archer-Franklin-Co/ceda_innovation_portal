# Need help guide: target ids

The "Need help?" guide (Figma 2.14 public, 3.40 staff) can ring any control that carries `data-guide="<area>.<action>"`. When someone asks a question, the page sends the targets that are **in the page and visible right now**. Menus and buttons are already hidden by capability, so the list only holds things that person can use. A step that names a target the page does not show is never ringed: after 2 seconds the guide offers "Skip this step".

Use these ids when you write manual pages or guide answers. Each one has a short English and Setswana label in i18n (`guide.target.<id>`, in `src/i18n/guide.*` of each app).

## How to add one

- Put `data-guide="area.action"` on the control (a button, link, field, tab or table row). Use lower camel case: `workflows.create`, `formBuilder.addField`.
- Add `guide.target.area.action` in English and Setswana to the app's `src/i18n/guide.*`.
- Fields whose label comes from the form builder use `data-guide-label` instead (the guide never reads what a person typed).
- Shared components: `Select` passes `data-guide` to its trigger, `Tabs` takes `guide` per tab, and `DataTable` takes `rowGuide` for its rows (the guide rings the first row).
- Never put a target on something the person cannot use. Hide the control by capability as usual, and the target goes with it.

## Staff console (`app: "staff"`)

| Id | Page | What it is |
| --- | --- | --- |
| `dashboard.queue` | Dashboard | Open the review queue |
| `dashboard.reports` | Dashboard | Reports |
| `review.filters` | Review queue | The filter chips |
| `review.open` | Review queue | An idea row (the first one is ringed) |
| `review.tab.idea` | Review queue, open idea | Idea tab |
| `review.tab.score` | Review queue, open idea | Score tab |
| `review.tab.files` | Review queue, open idea | Files tab |
| `review.sendToPanel` | Review queue, open idea | Send to the next step (the panel) |
| `review.askInfo` | Review queue, open idea | Ask for more info |
| `forms.create` | Forms | Create a form |
| `formBuilder.addStep` | Form builder | Add a step |
| `formBuilder.addField` | Form builder | Add a field (the field palette) |
| `formBuilder.preview` | Form builder | Preview |
| `formBuilder.publish` | Form builder | Publish |
| `workflows.create` | Workflows | Create workflow (also on the empty state) |
| `workflows.next` | Workflows, create dialog | Next |
| `workflows.name` | Workflows, create dialog | Workflow name |
| `workflows.createAndOpen` | Workflows, create dialog | Create and open |
| `workflowBuilder.addStage` | Workflow builder | Add a stage (the step palette) |
| `workflowBuilder.whoDoesIt` | Workflow builder, a stage | Who does it (assign to) |
| `workflowBuilder.check` | Workflow builder | Check |
| `workflowBuilder.publish` | Workflow builder | Publish |
| `users.search` | Users | Search people |
| `roles.create` | Roles & permissions | New role |
| `integrations.features` | Platform settings | Features tab |
| `integrations.sso` | Platform settings | Single sign-on tab |
| `integrations.sms` | Platform settings | SMS tab |
| `content.new` | Website content, All content | New |
| `content.open` | Website content, All content | A content row |

## Public site and innovator pages (`app: "public"`)

| Id | Page | What it is |
| --- | --- | --- |
| `nav.submitIdea` | Every page (header, phone menu) | Submit an idea / New idea |
| `nav.challenges` | Every page (header) | Challenges |
| `nav.signIn` | Every page (header, signed out) | Sign in |
| `home.primaryAction` | Home | The hero's main button (its words come from the home page editor) |
| `home.secondaryAction` | Home | The hero's second button |
| `challenge.enter` | Challenge detail | Enter this challenge |
| `idea.field.<key>` | Idea form | Each question, by its form field key (label from the form) |
| `idea.next` | Idea form | Next |
| `idea.back` | Idea form | Back |
| `idea.saveExit` | Idea form | Save and exit |
| `idea.send` | Idea form, last step | Send my idea |
| `idea.check` | Idea form | Check my idea (2.13), in the AI helper panel beside the form. Shown only when the AI helper is on; the guide then shows "Check my idea" next to Show me |
| `myIdeas.new` | My ideas | New idea |
| `myIdeas.open` | My ideas | Open an idea (the first card) |
| `track.progress` | Track my idea | Where your idea is (the stage timeline) |
| `track.reply` | Track my idea | Reply to the officer |

## Menu links

The guide also receives the menu links the person can see, as `{path, label}`: the staff sidebar (`aside nav a[href]`) and the public header and tab bar (`header nav a[href]`, `nav[aria-label] a[href]`). Answers can say "Go to Forms" with a `route` step.
