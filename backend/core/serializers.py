"""
DRF Serializers for Locus API.

Enforces the core Locus privacy & scavenger-hunt rule:
- `story_text` and `media_items` are ONLY included in serialized Tag output if:
  1. The requesting user is the `creator` of the Tag, OR
  2. The requesting user has a `TagUnlock` record for this Tag (meaning they physically
     visited the location within `unlock_radius_meters`).
- Otherwise, `is_unlocked` is `False`, `story_text` is omitted, and `media_items` are omitted
  (though `media_summary` counts of photos/audio/video are shown as a teaser!).
"""

from django.contrib.auth.models import User
from rest_framework import serializers

from .geo import calculate_distance_meters
from .models import (
    Circle,
    CircleMembership,
    CircleMessage,
    Tag,
    TagMedia,
    TagUnlock,
)


class UserBriefSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()
    storage_used_mb = serializers.SerializerMethodField()
    storage_quota_mb = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "display_name",
            "avatar_url",
            "storage_used_mb",
            "storage_quota_mb",
        )

    def get_display_name(self, obj: User) -> str:
        profile = getattr(obj, "profile", None)
        return (profile.display_name if profile and profile.display_name else obj.get_full_name()) or obj.username

    def get_avatar_url(self, obj: User) -> str:
        profile = getattr(obj, "profile", None)
        return profile.avatar_url if profile else ""

    def get_storage_used_mb(self, obj: User) -> float:
        profile = getattr(obj, "profile", None)
        return profile.storage_used_mb if profile else 0.0

    def get_storage_quota_mb(self, obj: User) -> int:
        profile = getattr(obj, "profile", None)
        return profile.storage_quota_mb if profile else 500


class TagMediaSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = TagMedia
        fields = (
            "id",
            "media_type",
            "file_url",
            "caption",
            "file_size_bytes",
            "duration_seconds",
            "display_order",
            "created_at",
        )

    def get_file_url(self, obj: TagMedia) -> str:
        if not obj.file:
            return ""
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url


class TagSerializer(serializers.ModelSerializer):
    creator = UserBriefSerializer(read_only=True)
    circle_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Circle.objects.all(),
        source="circles",
        required=False,
    )
    is_creator = serializers.SerializerMethodField()
    is_unlocked = serializers.SerializerMethodField()
    unlocked_at = serializers.SerializerMethodField()
    distance_meters = serializers.SerializerMethodField()
    can_unlock_now = serializers.SerializerMethodField()
    media_summary = serializers.SerializerMethodField()
    story_text = serializers.SerializerMethodField()
    media_items = serializers.SerializerMethodField()
    unlock_count = serializers.SerializerMethodField()

    class Meta:
        model = Tag
        fields = (
            "id",
            "creator",
            "circle_ids",
            "title",
            "teaser_hint",
            "address_label",
            "latitude",
            "longitude",
            "unlock_radius_meters",
            "visibility",
            "recorded_year",
            "is_creator",
            "is_unlocked",
            "unlocked_at",
            "distance_meters",
            "can_unlock_now",
            "media_summary",
            "story_text",
            "media_items",
            "unlock_count",
            "created_at",
            "updated_at",
        )

    def _has_access(self, obj: Tag) -> bool:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        if obj.creator_id == request.user.id:
            return True
        unlocked_tag_ids = self.context.get("unlocked_tag_ids")
        if unlocked_tag_ids is not None:
            return obj.id in unlocked_tag_ids
        return TagUnlock.objects.filter(tag=obj, user=request.user).exists()

    def get_is_creator(self, obj: Tag) -> bool:
        request = self.context.get("request")
        return bool(request and request.user.is_authenticated and obj.creator_id == request.user.id)

    def get_is_unlocked(self, obj: Tag) -> bool:
        return self._has_access(obj)

    def get_unlocked_at(self, obj: Tag):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        unlock = obj.unlocks.filter(user=request.user).first()
        return unlock.unlocked_at.isoformat() if unlock else None

    def get_distance_meters(self, obj: Tag):
        viewer_lat = self.context.get("viewer_lat")
        viewer_lon = self.context.get("viewer_lon")
        if viewer_lat is None or viewer_lon is None:
            return None
        return calculate_distance_meters(viewer_lat, viewer_lon, obj.latitude, obj.longitude)

    def get_can_unlock_now(self, obj: Tag) -> bool:
        dist = self.get_distance_meters(obj)
        if dist is None:
            return False
        return dist <= obj.unlock_radius_meters

    def get_media_summary(self, obj: Tag) -> dict:
        items = list(obj.media_items.all())
        return {
            "total": len(items),
            "images": sum(1 for m in items if m.media_type == TagMedia.MediaType.IMAGE),
            "audio": sum(1 for m in items if m.media_type == TagMedia.MediaType.AUDIO),
            "video": sum(1 for m in items if m.media_type == TagMedia.MediaType.VIDEO),
        }

    def get_story_text(self, obj: Tag):
        if self._has_access(obj):
            return obj.story_text
        return None  # Locked until the viewer visits the physical location!

    def get_media_items(self, obj: Tag):
        if self._has_access(obj):
            return TagMediaSerializer(
                obj.media_items.all(), many=True, context=self.context
            ).data
        return []  # Locked until visited!

    def get_unlock_count(self, obj: Tag) -> int:
        return obj.unlocks.count()


class TagCreateUpdateSerializer(serializers.ModelSerializer):
    circle_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Circle.objects.all(),
        source="circles",
        required=False,
    )

    class Meta:
        model = Tag
        fields = (
            "id",
            "title",
            "teaser_hint",
            "address_label",
            "latitude",
            "longitude",
            "unlock_radius_meters",
            "visibility",
            "story_text",
            "recorded_year",
            "circle_ids",
        )


class CircleMembershipSerializer(serializers.ModelSerializer):
    user = UserBriefSerializer(read_only=True)

    class Meta:
        model = CircleMembership
        fields = ("id", "user", "role", "joined_at")


class CircleSerializer(serializers.ModelSerializer):
    created_by = UserBriefSerializer(read_only=True)
    memberships = CircleMembershipSerializer(many=True, read_only=True)
    tag_count = serializers.SerializerMethodField()

    class Meta:
        model = Circle
        fields = (
            "id",
            "name",
            "description",
            "invite_code",
            "created_by",
            "memberships",
            "tag_count",
            "created_at",
        )
        read_only_fields = ("invite_code", "created_by", "created_at")

    def get_tag_count(self, obj: Circle) -> int:
        return obj.tags.count()


class CircleMessageSerializer(serializers.ModelSerializer):
    sender = UserBriefSerializer(read_only=True)
    tag_title = serializers.SerializerMethodField()

    class Meta:
        model = CircleMessage
        fields = (
            "id",
            "circle",
            "sender",
            "tag",
            "tag_title",
            "text",
            "is_system_event",
            "created_at",
        )
        read_only_fields = ("sender", "is_system_event", "created_at")

    def get_tag_title(self, obj: CircleMessage):
        return obj.tag.title if obj.tag else None
