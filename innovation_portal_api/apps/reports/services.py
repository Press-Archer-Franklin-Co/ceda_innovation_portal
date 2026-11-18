from apps.reports.selectors import ReportSelector


class ReportService:
    @staticmethod
    def dashboard():
        return ReportSelector.dashboard()
