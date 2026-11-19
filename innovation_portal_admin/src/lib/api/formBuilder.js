import { client } from './client'

/**
 * Staff form builder and challenge builder calls (U5: screens 3.4 to 3.7).
 *
 * - forms: planned in B4, not built yet. Paths follow the B4 prompt. TODO(B4)
 * - programSetup: setup-status is planned in B5 (TODO(B5)); attaching a form
 *   is planned in B4 (TODO(B4)).
 * - programJudging: no endpoint is planned yet; the path is the one suggested
 *   in request R-10. TODO(R-10)
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
 * @property {FieldWidth[][]} [layout_preview]  TODO(R-9): widths of the first rows, for the card picture.
 *
 * @typedef {Object} FormList
 * @property {FormListItem[]} results
 * @property {Record<'all'|FormStatus, number>} [counts]  TODO(R-9)
 *
 * @typedef {Object} FormTemplate
 * @property {string} id
 * @property {string} name
 * @property {number} question_count
 * @property {number} [step_count]  TODO(R-9)
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
 * @property {string} field_type
 * @property {BilingualText} label
 * @property {BilingualText} [help_text]
 * @property {BilingualText} [placeholder]
 * @property {boolean} required
 * @property {FieldWidth} width
 * @property {number} row
 * @property {number} ordering
 * @property {Array<{value: string, label: BilingualText, description?: BilingualText}>} options  description: TODO(R-6)
 * @property {Array<{rule_type: string, rule_value: string, error_message: string}>} rules
 * @property {Condition|null} visible_if
 * @property {Condition|null} required_if
 * @property {boolean} [is_challenge_question]  TODO(R-6)
 *
 * @typedef {Object} DraftStep
 * @property {string} [id]
 * @property {string} code
 * @property {BilingualText} title
 * @property {BilingualText} [description]
 * @property {number} ordering
 * @property {DraftField[]} fields
 * @property {BilingualText[]} [tips]  TODO(R-6)
 *
 * @typedef {Object} FormDraft  GET and PUT /api/forms/{id}/draft/ use the same document.
 * @property {string} id
 * @property {string} name
 * @property {FormStatus} status
 * @property {string[]} languages
 * @property {DraftStep[]} steps
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
}

export const programSetup = {
  /** TODO(B5): which of the 6 steps are complete. */
  setupStatus: (programId)         => client.get(`/api/programs/${programId}/setup-status/`),
  /** TODO(B4): attach a form (its latest published version). */
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
  /** TODO(R-10) @returns {Promise<ProgramJudging>} */
  get:     (programId)       => client.get(`/api/programs/${programId}/judging/`),
  /** TODO(R-10) @param {ProgramJudging} body */
  save:    (programId, body) => client.put(`/api/programs/${programId}/judging/`, body),
  /** TODO(R-10): shared criteria library across challenges. */
  library: (params)          => client.get('/api/evaluations/criteria-library/', params),
}
