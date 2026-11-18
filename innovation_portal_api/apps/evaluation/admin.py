from django.contrib import admin

from apps.evaluation.models import (
    CriterionScore,
    EvaluationRound,
    FinalDecision,
    JudgeComment,
    ModerationRecord,
    Rubric,
    RubricCriterion,
    RubricVersion,
    ScoreSheet,
)

admin.site.register(Rubric)
admin.site.register(RubricVersion)
admin.site.register(RubricCriterion)
admin.site.register(EvaluationRound)
admin.site.register(ScoreSheet)
admin.site.register(CriterionScore)
admin.site.register(JudgeComment)
admin.site.register(ModerationRecord)
admin.site.register(FinalDecision)
