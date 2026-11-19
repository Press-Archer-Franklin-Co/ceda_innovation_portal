from apps.reference.models import District, Sector


class ReferenceSelector:
    @staticmethod
    def active_sectors():
        return Sector.objects.filter(active=True).order_by("ordering", "slug")

    @staticmethod
    def active_districts():
        return District.objects.filter(active=True).order_by("ordering", "slug")
