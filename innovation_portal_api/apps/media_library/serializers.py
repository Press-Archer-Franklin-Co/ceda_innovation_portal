from rest_framework import serializers

from apps.core.i18n import TranslatedTextField
from apps.media_library.models import MediaAsset


def _absolute_url(request, field_file):
    if not field_file:
        return None
    url = field_file.url
    return request.build_absolute_uri(url) if request else url


class MediaUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    kind = serializers.ChoiceField(choices=MediaAsset.Kind.choices, required=False, help_text="Optional. Upload is refused if the file is a different kind.")
    alt_text = TranslatedTextField(required=False, max_length=500, help_text='Alt text as {"en": "...", "tn": "..."} or a plain English string.')
    captions = serializers.FileField(required=False, help_text="WebVTT (.vtt) or SRT (.srt) captions for a video. Max 1 MB.")
    duration_seconds = serializers.FloatField(required=False, min_value=0, help_text="Length of a video or audio file, if the client knows it.")
    make_monochrome = serializers.BooleanField(required=False, default=False, help_text="For logos: also store a one-colour PNG copy.")
    monochrome_color = serializers.RegexField(r"^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$", required=False, help_text="Colour of the one-colour copy. Default #000000.")

    def to_internal_value(self, data):
        # alt_text arrives as a string in multipart forms; accept JSON text too.
        if hasattr(data, "get") and isinstance(data.get("alt_text"), str):
            raw = data.get("alt_text").strip()
            if raw.startswith("{"):
                import json

                try:
                    parsed = json.loads(raw)
                except ValueError:
                    parsed = None
                if parsed is not None:
                    # A plain dict avoids deep-copying uploaded files in the QueryDict.
                    data = {key: data.get(key) for key in data.keys()}
                    data["alt_text"] = parsed
        return super().to_internal_value(data)


class MediaAssetSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    monochrome_url = serializers.SerializerMethodField()
    captions_url = serializers.SerializerMethodField()
    alt_text = TranslatedTextField(read_only=True)

    class Meta:
        model = MediaAsset
        fields = (
            "id",
            "kind",
            "url",
            "monochrome_url",
            "captions_url",
            "original_filename",
            "mime_type",
            "size_bytes",
            "width",
            "height",
            "duration_seconds",
            "alt_text",
            "uploaded_by",
            "created_at",
        )
        read_only_fields = fields

    def get_url(self, obj):
        return _absolute_url(self.context.get("request"), obj.file)

    def get_monochrome_url(self, obj):
        return _absolute_url(self.context.get("request"), obj.monochrome_file)

    def get_captions_url(self, obj):
        return _absolute_url(self.context.get("request"), obj.captions_file)
