import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, Plus, Trash2, UserCheck } from 'lucide-react'
import SectionCard from '../ui/SectionCard'
import { evaluations, programs } from '../../lib/api/endpoints'
import { useConfirm } from '../../components/ui/confirm'

const STATUS = {
  not_invited: { label: 'Invite on marking day', cls: 'bg-gray-100 text-gray-600' },
  invited:     { label: 'Invited',               cls: 'bg-blue-50 text-blue-700' },
  accepted:    { label: 'Marking',               cls: 'bg-ceda-green-pale text-ceda-forest' },
}

function asList(data) {
  return Array.isArray(data) ? data : data?.results ?? []
}

export default function ChallengeJudgingCard({ programId, form, setForm }) {
  const confirm = useConfirm()
  const qc = useQueryClient()
  const [newJudge, setNewJudge] = useState({ name: '', email: '' })
  const [error, setError] = useState(null)

  const { data: criteriaData } = useQuery({
    queryKey: ['marking-criteria', 'active'],
    queryFn: () => evaluations.listMarkingCriteria({ is_active: true }),
  })
  const criteria = asList(criteriaData)

  const judgesKey = ['program-judges', programId]
  const { data: judgesData } = useQuery({
    queryKey: judgesKey,
    queryFn: () => programs.judges(programId),
    enabled: !!programId,
  })
  const judges = asList(judgesData)

  const addJudge = useMutation({
    mutationFn: () => programs.addJudge(programId, { name: newJudge.name.trim(), email: newJudge.email.trim() }),
    onSuccess: () => { setNewJudge({ name: '', email: '' }); setError(null); qc.invalidateQueries({ queryKey: judgesKey }) },
    onError: (err) => setError(err.message),
  })
  const removeJudge = useMutation({
    mutationFn: (judgeId) => programs.removeJudge(programId, judgeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: judgesKey }),
    onError: (err) => setError(err.message),
  })

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newJudge.email.trim())

  return (
    <SectionCard title="Judging">
      <div className="space-y-4">
        <p className="text-xs text-ceda-muted">
          Judging runs automatically: when entries close, every judge below is emailed an invitation with a link to their
          marking page. Each judge marks every entry, and anyone with unmarked entries gets a reminder every day and again
          in the final hours before marking closes.
        </p>

        <div>
          <label className="label">Marking Criteria</label>
          <select
            className="input"
            value={form.marking_criteria ?? ''}
            onChange={(e) => setForm(prev => ({ ...prev, marking_criteria: e.target.value }))}
          >
            <option value="">Select marking criteria…</option>
            {criteria.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          {!form.marking_criteria && <p className="text-xs text-ceda-red mt-1">Judges can't mark until marking criteria are selected.</p>}
        </div>

        <div>
          <label className="label">Marking Closes</label>
          <input
            className="input"
            type="datetime-local"
            value={form.judging_end}
            onChange={(e) => setForm(prev => ({ ...prev, judging_end: e.target.value }))}
          />
          <p className="text-xs text-ceda-muted mt-1">Marking locks at this time and the winners are worked out from the marks that are in.</p>
        </div>

        <div className="pt-2 border-t border-ceda-border">
          <p className="text-xs font-semibold text-ceda-muted uppercase tracking-wide mb-2">Judges ({judges.length})</p>
          {!programId ? (
            <p className="text-xs text-ceda-muted">Save the challenge first, then add judges here.</p>
          ) : (
            <div className="space-y-2">
              {judges.map(judge => {
                const status = STATUS[judge.status] ?? STATUS.not_invited
                return (
                  <div key={judge.id} className="flex items-start gap-2 rounded-xl border border-ceda-border px-3 py-2">
                    <UserCheck size={14} className="text-ceda-muted mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ceda-dark truncate">{judge.name}</p>
                      <p className="text-xs text-ceda-muted truncate">{judge.email}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${status.cls}`}>{status.label}</span>
                        {judge.status !== 'not_invited' && (
                          <span className="text-[11px] text-ceda-muted">
                            Marked {judge.progress?.marked ?? 0} · {judge.progress?.outstanding ?? 0} to go
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      className="btn-ghost btn-sm text-ceda-red"
                      title="Remove judge"
                      disabled={removeJudge.isPending}
                      onClick={async () => { if (await confirm({ title: `Remove ${judge.name} as a judge?`, body: 'They stop seeing entries for this challenge. Marks they already gave are kept.', confirmLabel: 'Remove judge' })) removeJudge.mutate(judge.id) }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}

              <div className="space-y-2 rounded-xl border border-dashed border-ceda-border p-3">
                <input className="input" placeholder="Judge's full name" value={newJudge.name} onChange={(e) => setNewJudge(p => ({ ...p, name: e.target.value }))} />
                <input className="input" type="email" placeholder="Email (CEDA or external)" value={newJudge.email} onChange={(e) => setNewJudge(p => ({ ...p, email: e.target.value }))} />
                <button
                  className="btn-secondary btn-sm w-full justify-center"
                  disabled={addJudge.isPending || !newJudge.name.trim() || !emailValid}
                  onClick={() => addJudge.mutate()}
                >
                  <Plus size={13} /> Add judge
                </button>
                <p className="text-[11px] text-ceda-muted flex items-center gap-1">
                  <Mail size={11} /> Nothing is sent now. Invitations go out automatically when entries close.
                </p>
              </div>
              {error && <p className="text-xs text-ceda-red">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  )
}
