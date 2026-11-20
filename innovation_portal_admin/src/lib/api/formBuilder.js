import { client } from './client'

/**
 * Staff form builder and challenge builder calls (U5: screens 3.4 to 3.7).
 *
 * - forms: B4, on main. Document shape: apps/programs/form_schema.py.
 * - programSetup: setup status (B5) and attaching a form (B4), on main.
 * - programJudging: B5 (R-10), on main.
 * Existing marking-criteria calls live in endpoints.js (evaluations).
 */

/**
 * @typedef {'draft'|'live'|'closed'|'archived'} FormStatus
 * @typedef {'quarter'|'half'|'three_quarter'|'full'} FieldWidth
 * @typedef {{en: string, tn?: string}} BilingualText
 *
 * @typedef {Object} FormListItem
 * @property {string} id
 * @property {string} name
 * @property {FormStatus} status
 * @property {Array<{id: string, title: string}>} programs   Linked challenges; empty means "Always open" for general intake.
 * @property {number} answer_count
 * @property {number} question_count
 * @property {number} step_count
 * @property {string[]} languages
 * @property {string} updated_at
 * @property {FieldWidth[][]} layout_preview  Widths of the first rows, for the card picture.
 *
 * @typedef {Object} FormList
 * @property {FormListItem[]} results
 * @property {Record<'all'|FormStatus, number>} counts  Follows ?search, not ?status; 'all' leaves out archived.
 *
 * @typedef {Object} FormTemplate
 * @property {string} id
 * @property {string} name
 * @property {number} question_count
 * @property {number} step_count
 * @property {{description?: string, estimated_minutes?: number, works_on_ussd?: boolean}} template_meta
 *
 * @typedef {Object} CreateFormRequest
 * @property {'template'|'scratch'|'copy'} start
 * @property {string} [source_id]
 * @property {string} name
 * @property {string} [program_id]
 * @property {string[]} languages   Default ['en', 'tn'].
 *
 * @typedef {Object} Condition  The one shape B4 documents.
 * @property {Array<{field: string, op: 'equals'|'not_equals'|'in'|'is_empty'|'is_not_empty', value?: unknown}>} all
 *
 * @typedef {Object} DraftField
 * @property {string} [id]
 * @property {string} key
 * @property {string} type
 * @property {BilingualText} label
 * @property {BilingualText} [help_text]
 * @property {BilingualText} [placeholder]
 * @property {boolean} required
 * @property {FieldWidth} width
 * @property {boolean} is_active
 * @property {Array<{id?: string, value: string, label: BilingualText, description: BilingualText}>} options
 * @property {Array<{rule_type: string, rule_value: string, error_message: string}>} rules
 * @property {Condition|{}} visible_if   An unset condition is {}.
 * @property {Condition|{}} required_if
 * @property {Condition|{}} enabled_if
 * @property {boolean} is_challenge_question
 *
 * @typedef {Object} DraftStep
 * @property {string} [id]
 * @property {string} code
 * @property {BilingualText} title
 * @property {BilingualText} [description]
 * @property {BilingualText[]} tips
 * @property {boolean} is_active
 * @property {Array<{row: number, fields: DraftField[]}>} rows   Order within a row is left to right.
 *
 * @typedef {Object} FormDraft  GET and PUT /api/forms/{id}/draft/ use the same document.
 * @property {string} id
 * @property {BilingualText} name
 * @property {BilingualText} description
 * @property {string[]} languages
 * @property {DraftStep[]} steps
 * @property {DraftField[]} loose_fields  Old fields that are in no step.
 *
 * @typedef {Object} PublishProblem
 * @property {string} [field]
 * @property {string} [step]
 * @property {string} message
 *
 * @typedef {Object} TranslationRow
 * @property {string} key
 * @property {string} where
 * @property {string} en
 * @property {string} tn
 * @property {boolean} missing
 */

export const forms = {
  /** @returns {Promise<FormList|FormListItem[]>} */
  list:        (params)        => client.get('/api/forms/', params),
  /** @returns {Promise<FormTemplate[]>} */
  templates:   ()              => client.get('/api/forms/templates/'),
  /** @param {CreateFormRequest} body */
  create:      (body)          => client.post('/api/forms/', body),
  duplicate:   (id)            => client.post(`/api/forms/${id}/duplicate/`, {}),
  archive:     (id)            => client.post(`/api/forms/${id}/archive/`, {}),
  exportCsv:   (id)            => client.getBlob(`/api/forms/${id}/responses/export/`, { format: 'csv' }),

  /** @returns {Promise<FormDraft>} */
  draft:       (id)            => client.get(`/api/forms/${id}/draft/`),
  /** @param {FormDraft} doc */
  saveDraft:   (id, doc)       => client.put(`/api/forms/${id}/draft/`, doc),
  /** Returns the problem list instead of publishing when something blocks it. */
  publish:     (id)            => client.post(`/api/forms/${id}/publish/`, {}),
  published:   (id, lang)      => client.get(`/api/forms/${id}/published/`, { lang }),

  /** @returns {Promise<TranslationRow[]|{results: TranslationRow[]}>} */
  translations:     (id)       => client.get(`/api/forms/${id}/translations/`),
  saveTranslations: (id, rows) => client.put(`/api/forms/${id}/translations/`, rows),
  /** 501 when no translation provider is set up. Suggestions are never saved by the API. */
  suggest:          (id, keys) => client.post(`/api/forms/${id}/translations/suggest/`, keys ? { keys } : {}),
  requestReview:    (id, body) => client.post(`/api/forms/${id}/translations/request-review/`, body ?? {}),
  /** Active staff roles, custom ones included (R-32). Needs forms.manage. */
  reviewRoles:      ()         => client.get('/api/forms/review-roles/'),
}

export const programSetup = {
  /** Which of the 6 steps are complete (B5). */
  setupStatus: (programId)         => client.get(`/api/programs/${programId}/setup-status/`),
  /** Attach a form (its latest published version). */
  attachForm:  (programId, formId) => client.put(`/api/programs/${programId}/form/`, { form_id: formId }),
}

/**
 * @typedef {Object} JudgingCriterion
 * @property {string} [library_id]
 * @property {string} name
 * @property {string} description
 * @property {number} weight
 * @property {number} order
 * @property {Record<'1'|'2'|'3'|'4'|'5', BilingualText>} [score_meanings]
 * @property {number[]} [comment_required_scores]
 *
 * @typedef {Object} ProgramJudging
 * @property {JudgingCriterion[]} criteria
 * @property {number} total
 * @property {number|null} pass_mark
 * @property {number|null} reviewers_per_idea
 */
export const programJudging = {
  /** @returns {Promise<ProgramJudging>} */
  get:     (programId)       => client.get(`/api/programs/${programId}/judging/`),
  /** Refused unless weights total 100 (errors.total). @param {ProgramJudging} body */
  save:    (programId, body) => client.put(`/api/programs/${programId}/judging/`, body),
  /** The shared criteria library across challenges (R-10, B5). */
  library: (params)          => client.get('/api/evaluations/criteria-library/', params),
  /** Adds a criterion to the library: { name, description, score_meanings?, comment_required_scores? }. */
  addToLibrary: (body)       => client.post('/api/evaluations/criteria-library/', body),
}
