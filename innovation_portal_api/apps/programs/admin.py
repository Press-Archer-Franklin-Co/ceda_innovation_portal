from django.contrib import admin

from apps.programs.models import (
    ChallengeTheme,
    EligibilityRule,
    Program,
    ProgramStage,
    ProgramTimeline,
    ProgramType,
    SubmissionForm,
    SubmissionFormField,
    SubmissionFormFieldOption,
    TermsAndConditions,
)

admin.site.register(ProgramType)
admin.site.register(Program)
admin.site.register(ProgramStage)
admin.site.register(ProgramTimeline)
admin.site.register(EligibilityRule)
admin.site.register(TermsAndConditions)
admin.site.register(ChallengeTheme)
admin.site.register(SubmissionForm)
admin.site.register(SubmissionFormField)
admin.site.register(SubmissionFormFieldOption)
