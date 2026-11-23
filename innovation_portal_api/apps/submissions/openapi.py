"""Response shapes for the B2 innovator, draft and tracking endpoints (documentation only, R-12)."""

from rest_framework import serializers

from apps.core.openapi import envelope
from apps.submissions.serializers import ApplicationDraftSerializer


class SectorRefSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    slug = serializers.CharField()
    name = serializers.CharField()


class ProgramRefSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    is_general_intake = serializers.BooleanField()


class StageRefSerializer(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField()
    status = serializers.ChoiceField(choices=["done", "current", "upcoming", "skipped"])


class IdeaItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=["draft", "submission"])
    state = serializers.ChoiceField(choices=["drafts", "needs_action", "in_review", "finished"])
    reference = serializers.CharField()
    title = serializers.CharField()
    sector = SectorRefSerializer(allow_null=True)
    program = ProgramRefSerializer()
    stage = serializers.CharField()
    percent_complete = serializers.IntegerField()
    last_change = serializers.DateTimeField(allow_null=True)
    needs_action_reason = serializers.CharField()
    reply_by = serializers.DateTimeField(allow_null=True)
    stages = StageRefSerializer(many=True, help_text="Empty for drafts.")
    submitted_at = serializers.DateTimeField(allow_null=True)
    decided_at = serializers.DateTimeField(allow_null=True)
    has_feedback = serializers.BooleanField()


class IdeaCountsSerializer(serializers.Serializer):
    all = serializers.IntegerField()
    needs_action = serializers.IntegerField()
    drafts = serializers.IntegerField()
    in_review = serializers.IntegerField()
    finished = serializers.IntegerField()


class MyIdeasSerializer(serializers.Serializer):
    filter = serializers.CharField()
    counts = IdeaCountsSerializer()
    results = IdeaItemSerializer(many=True)


class NextActionSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=["answer_question", "finish_draft", "complete_profile"])
    idea_id = serializers.UUIDField(required=False)
    reference = serializers.CharField(required=False)
    title = serializers.CharField(required=False)
    detail = serializers.CharField()
    reply_by = serializers.DateTimeField(required=False, allow_null=True)
    percent_complete = serializers.IntegerField(required=False)
    program = serializers.DictField(required=False, help_text="finish_draft only: {id, title, slug, is_general_intake}.")


class MySummarySerializer(serializers.Serializer):
    active_idea = IdeaItemSerializer(allow_null=True)
    next_action = NextActionSerializer(allow_null=True)
    unread_notifications = serializers.IntegerField()
    messages = serializers.ListField(
        child=serializers.DictField(),
        help_text=(
            "2.1 home messages, most urgent first: changes_requested {note, officer, fix_by}, question "
            "{officer_first_name, excerpt, reply_by}, draft {percent_complete}, shortlisted {challenge}, stage_moved "
            "{status, stage}, event {challenge, event_date}. Each has type, idea_id, kind, reference, title and at."
        ),
    )


class LinkRefSerializer(serializers.Serializer):
    type = serializers.CharField()
    id = serializers.UUIDField()


class UpdateItemSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=["notification", "status_change"])
    notification_type = serializers.CharField()
    link = LinkRefSerializer(allow_null=True)
    id = serializers.UUIDField()
    title = serializers.CharField()
    at = serializers.DateTimeField()
    body = serializers.CharField(required=False, help_text="Notifications only.")
    is_read = serializers.BooleanField(required=False, help_text="Notifications only.")
    idea_id = serializers.UUIDField(required=False, help_text="Status changes only.")
    reference = serializers.CharField(required=False, help_text="Status changes only.")
    status = serializers.CharField(required=False, help_text="Status changes only.")


class MyUpdatesSerializer(serializers.Serializer):
    since = serializers.DateTimeField()
    results = UpdateItemSerializer(many=True)


class ChallengeItemSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    slug = serializers.CharField()
    program_type = serializers.CharField()
    closes_at = serializers.DateTimeField(allow_null=True)
    sectors = SectorRefSerializer(many=True)
    matched_sectors = SectorRefSerializer(many=True)
    can_enter = serializers.BooleanField()


class ChallengeMatchSerializer(ChallengeItemSerializer):
    answers_reused = serializers.IntegerField()
    questions_left = serializers.IntegerField()


class ChallengeMatchesSerializer(serializers.Serializer):
    idea_id = serializers.UUIDField()
    results = ChallengeMatchSerializer(many=True)
    detail = serializers.CharField(required=False)


class UnansweredQuestionSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    section_code = serializers.CharField()
    required = serializers.BooleanField()


class LinkChallengeSerializer(serializers.Serializer):
    draft = ApplicationDraftSerializer()
    copied_fields = serializers.ListField(child=serializers.CharField())
    unanswered_questions = UnansweredQuestionSerializer(many=True)


class SimilarIdeaSerializer(serializers.Serializer):
    title = serializers.CharField()
    year = serializers.IntegerField(allow_null=True)
    place = serializers.CharField()


class SimilarIdeasSerializer(serializers.Serializer):
    results = SimilarIdeaSerializer(many=True)


class StepSaveSerializer(serializers.Serializer):
    saved_at = serializers.DateTimeField()
    step_status = serializers.DictField(child=serializers.ChoiceField(choices=["done", "in_progress", "not_started"]), help_text="Section code -> status.")
    percent_complete = serializers.IntegerField()
    errors = serializers.DictField(child=serializers.ListField(child=serializers.CharField()), help_text="Field key -> messages. Empty when the step is fine.")


class SubmitAccountSerializer(serializers.Serializer):
    created = serializers.BooleanField()
    sign_in_with = serializers.ChoiceField(choices=["phone_code", "email"])


class CopySentToSerializer(serializers.Serializer):
    channel = serializers.ChoiceField(choices=["email", "sms"])
    to = serializers.CharField(help_text="Masked.")


class SubmitResultSerializer(serializers.Serializer):
    submission_id = serializers.UUIDField()
    reference = serializers.CharField(help_text="CEDA-IP-YYYY-NNNNN")
    title = serializers.CharField()
    sector = SectorRefSerializer(allow_null=True)
    is_guest = serializers.BooleanField()
    next_steps = serializers.ListField(child=serializers.DictField())
    copy_sent_to = CopySentToSerializer(allow_null=True)
    account = SubmitAccountSerializer(allow_null=True)
    first_name = serializers.CharField()


class QuickStartDataSerializer(serializers.Serializer):
    draft_id = serializers.UUIDField()
    resume_token = serializers.CharField()
    expires_in = serializers.IntegerField(help_text="Seconds until the resume token stops working.")


class TimelineStageSerializer(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField()
    status = serializers.ChoiceField(choices=["done", "current", "upcoming", "skipped"])
    reached_at = serializers.DateTimeField(allow_null=True)
    explanation = serializers.CharField()
    usual_duration = serializers.CharField()
    officer = serializers.CharField(required=False, help_text="Only on signed-in tracking, for the current stage.")


class TimelineSerializer(serializers.Serializer):
    stages = TimelineStageSerializer(many=True)
    current_stage_code = serializers.CharField()
    next_panel_at = serializers.DateTimeField(allow_null=True)


class TrackingDetailSerializer(serializers.Serializer):
    reference_number = serializers.CharField()
    submission_type = serializers.CharField()
    current_status = serializers.CharField()
    submitted_at = serializers.DateTimeField(allow_null=True)
    updated_at = serializers.DateTimeField()
    current_step = serializers.CharField()
    applicant_action_required = serializers.BooleanField()
    status_history = serializers.ListField(child=serializers.DictField())
    journey = serializers.ListField(child=serializers.DictField())
    workflow_history = serializers.ListField(child=serializers.DictField())
    timeline = TimelineSerializer()


SUMMARY = envelope("MySummaryResponse", MySummarySerializer())
IDEAS = envelope("MyIdeasResponse", MyIdeasSerializer())
UPDATES = envelope("MyUpdatesResponse", MyUpdatesSerializer())
RECOMMENDED = envelope("RecommendedChallengesResponse", ChallengeItemSerializer(many=True))
MATCHES = envelope("ChallengeMatchesResponse", ChallengeMatchesSerializer())
LINK = envelope("LinkChallengeResponse", LinkChallengeSerializer())
SIMILAR = envelope("SimilarIdeasResponse", SimilarIdeasSerializer())
STEP = envelope("DraftStepSaveResponse", StepSaveSerializer())
SUBMIT = envelope("DraftSubmitResponse", SubmitResultSerializer())
QUICK_START = envelope("QuickStartResponse", QuickStartDataSerializer())
DRAFT = envelope("DraftResponse", ApplicationDraftSerializer())
TRACKING = envelope("TrackingDetailResponse", TrackingDetailSerializer())
