from django.contrib import admin

from apps.assignments.models import Assignment, AssignmentAcceptance, ConflictOfInterestDeclaration, MentorAssignment, ReviewPanel

admin.site.register(ReviewPanel)
admin.site.register(Assignment)
admin.site.register(AssignmentAcceptance)
admin.site.register(ConflictOfInterestDeclaration)
admin.site.register(MentorAssignment)
