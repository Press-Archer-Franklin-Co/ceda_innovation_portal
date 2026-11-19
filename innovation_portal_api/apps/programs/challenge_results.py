from django.db import transaction
from django.utils import timezone

from apps.audit.services import AuditService
from apps.core.constants import ProgramStatus, ProgramTypeCode, SubmissionStatus
from apps.notifications.services import NotificationService
from apps.programs.models import Program

PLACE_POSITIONS = ["1st", "2nd", "3rd"]
DEFAULT_WINNER_COUNT = 3


class ChallengeResultsService:
    """Announces innovation challenge winners automatically.

    When Marking Closes passes, the marks that are in are settled and entries are
    ranked by their final judging score (entries nobody marked are left out).
    Results never go out earlier, so a judge added late can still mark every
    entry. Winners are
    marked, added to the challenge's winners section and emailed; everyone else
    is told the results are out. The number of winners is the number of prizes
    on the challenge page (3 if none are listed). A tie that affects a winning
    position puts the run on hold and alerts the challenge owner instead.
    """

    @classmethod
    def process_due(cls, now=None) -> int:
        now = now or timezone.now()
        programs = Program.objects.filter(
            program_type__code=ProgramTypeCode.INNOVATION_CHALLENGE,
            status__in=[ProgramStatus.PUBLISHED, ProgramStatus.CLOSED],
            results_announced_at__isnull=True,
        )
        return sum(1 for program in programs if cls.try_announce(program, now=now))

    @staticmethod
    def _final_score(submission):
        cycle = (
            submission.review_cycles.filter(status="completed")
            .order_by("-closed_at", "-created_at")
            .first()
        )
        if not cycle:
            return None
        score = cycle.aggregate_pct if cycle.aggregate_pct is not None else cycle.aggregate_score
        return float(score) if score is not None else None

    @classmethod
    def _hold(cls, program, reason: str) -> bool:
        if program.results_hold_reason != reason:
            program.results_hold_reason = reason
            program.save(update_fields=["results_hold_reason", "updated_at"])
            NotificationService.notify(
                user=program.owner,
                notification_type="challenge_results_on_hold",
                title=f"Results on hold: {program.title}",
                message=f"Winners for '{program.title}' were not announced automatically. {reason}",
                send_email=True,
            )
        return False

    @classmethod
    @transaction.atomic
    def try_announce(cls, program, now=None) -> bool:
        now = now or timezone.now()
        program = Program.objects.select_for_update().get(pk=program.pk)
        if program.results_announced_at:
            return False
        closes_at = program.submission_closes_at
        if closes_at is None or now <= closes_at:  # no close date (a draft) means not closed yet
            return False
        if program.results_publish_at and now < program.results_publish_at:
            return False

        entries = list(
            program.submissions.filter(submitted_at__isnull=False)
            .select_related("workflow_instance", "innovator", "team")
        )
        if not entries:
            return False
        marking_closes = program.marking_closes_at
        if not marking_closes:
            return cls._hold(program, "Set the Marking Closes date and time on the challenge so judging can finish.")
        if now <= marking_closes:
            return False

        from apps.programs.challenge_judging import ChallengeJudgingService

        ChallengeJudgingService.close_marking(program)

        ranked = []
        for entry in entries:
            instance = getattr(entry, "workflow_instance", None)
            if instance is not None and instance.status in {"rejected", "cancelled"}:
                continue
            score = cls._final_score(entry)
            if score is not None:
                ranked.append((score, entry))
        if not ranked:
            return cls._hold(
                program,
                "Marking has closed but no entry has any marks. Check the challenge has marking criteria and that judges have marked.",
            )
        ranked.sort(key=lambda item: (-item[0], item[1].submitted_at))

        detail = getattr(program, "hackathon_detail", None)
        prizes = list(detail.prizes) if detail and detail.prizes else []
        winner_count = min(len(prizes) or DEFAULT_WINNER_COUNT, len(ranked))
        tied = set()
        for index in range(winner_count):
            if index + 1 < len(ranked) and ranked[index][0] == ranked[index + 1][0]:
                tied.update({ranked[index][1].reference_number, ranked[index + 1][1].reference_number})
        if tied:
            return cls._hold(
                program,
                f"Entries {', '.join(sorted(tied))} have the same score for a winning position. Break the tie, then the results will be sent.",
            )

        from apps.content.models import WinnerSpotlight
        from apps.submissions.models import SubmissionStatusHistory

        winners = []
        for index, (score, entry) in enumerate(ranked[:winner_count]):
            prize = prizes[index] if index < len(prizes) and isinstance(prizes[index], dict) else {}
            position = PLACE_POSITIONS[index] if index < len(PLACE_POSITIONS) else "runner_up"
            previous_status = entry.current_status
            entry.current_status = SubmissionStatus.WINNER
            entry.save(update_fields=["current_status", "updated_at"])
            SubmissionStatusHistory.objects.create(
                submission=entry,
                from_status=previous_status,
                to_status=SubmissionStatus.WINNER,
                changed_by=None,
                reason="challenge_results",
                comment=f"Placed {position} with a final score of {score:.2f}.",
            )
            WinnerSpotlight.objects.update_or_create(
                submission=entry,
                defaults={
                    "program": program,
                    "team_name": entry.team.name if entry.team_id else (entry.innovator.full_name or entry.innovator.email),
                    "project_name": entry.title,
                    "position": position,
                    "prize_label": str(prize.get("label") or prize.get("position") or ""),
                    "prize_amount": str(prize.get("amount") or ""),
                    "members_count": entry.team.members.count() if entry.team_id else 1,
                    "year": now.year,
                },
            )
            prize_text = " ".join(part for part in [prize.get("label"), prize.get("amount")] if part)
            NotificationService.notify(
                user=entry.innovator,
                notification_type="challenge_winner",
                title=f"Congratulations! You placed {position} in {program.title}",
                message=(
                    f"Your entry '{entry.title}' ({entry.reference_number}) placed {position} in {program.title}."
                    + (f" Prize: {prize_text}." if prize_text else "")
                    + " The CEDA Innovation team will contact you about next steps."
                ),
                send_email=True,
            )
            winners.append(entry)

        winner_ids = {entry.id for entry in winners}
        for entry in entries:
            if entry.id in winner_ids:
                continue
            NotificationService.notify(
                user=entry.innovator,
                notification_type="challenge_results",
                title=f"Results announced: {program.title}",
                message=(
                    f"Thank you for entering {program.title}. Judging is complete and the winners have been announced. "
                    f"Your entry '{entry.title}' ({entry.reference_number}) was not selected this time."
                ),
                send_email=True,
            )

        program.results_announced_at = now
        program.results_hold_reason = ""
        program.save(update_fields=["results_announced_at", "results_hold_reason", "updated_at"])
        AuditService.log_action(
            actor=None,
            action_type="challenge_results_announced",
            target=program,
            after_state={"winners": [entry.reference_number for entry in winners]},
        )
        return True
