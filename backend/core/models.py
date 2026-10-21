"""
Database Models for Locus:
- UserProfile: Extends Django User with avatar, bio, and storage quota tracking.
- Circle & CircleMembership: Invite-only family/friend groups that share a map and group chat.
- Tag: A location-anchored memory (title, coordinates, unlock radius, visibility mode, story).
- TagMedia: Photos, audio recordings, or videos attached to a Tag.
- TagUnlock: Records when a viewer physically visits a Tag on mobile, permanently unlocking
  the memory for that user on both the Mobile App and the End-User Web Portal.
- CircleMessage: Group chat messages within a Circle, optionally linked to a specific Tag.
"""

import secrets
import uuid
from django.conf import settings
from django.contrib.auth.models import User
from django.db import models
from django.db.models import Sum


def generate_invite_code() -> str:
    return secrets.token_urlsafe(6).upper()[:8]


class UserProfile(models.Model):
    """Administrative & profile metadata for each Locus user."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    display_name = models.CharField(max_length=120, blank=True)
    bio = models.TextField(blank=True, help_text="Short family or personal bio.")
    avatar_url = models.URLField(blank=True)
    storage_quota_mb = models.PositiveIntegerField(
        default=settings.DEFAULT_STORAGE_QUOTA_MB,
        help_text="Maximum storage space (in MB) allowed for this user's uploaded media.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.display_name or self.user.username} ({self.user.email})"

    @property
    def storage_used_bytes(self) -> int:
        total = TagMedia.objects.filter(tag__creator=self.user).aggregate(
            total_bytes=Sum("file_size_bytes")
        )["total_bytes"]
        return total or 0

    @property
    def storage_used_mb(self) -> float:
        return round(self.storage_used_bytes / (1024 * 1024), 2)

    @property
    def storage_usage_percent(self) -> float:
        if self.storage_quota_mb <= 0:
            return 100.0
        return round((self.storage_used_mb / self.storage_quota_mb) * 100.0, 1)


class Circle(models.Model):
    """
    A private family or friend group (e.g., 'Todd & Daughter Memories').
    Members of a Circle share a map of Tags and a group chat feed.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    invite_code = models.CharField(
        max_length=16, unique=True, default=generate_invite_code
    )
    created_by = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="created_circles"
    )
    members = models.ManyToManyField(
        User, through="CircleMembership", related_name="circles"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} (Code: {self.invite_code})"


class CircleMembership(models.Model):
    """Links a User to a Circle with a role."""

    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Circle Admin / Recorder"
        MEMBER = "MEMBER", "Member / Viewer & Recorder"

    circle = models.ForeignKey(
        Circle, on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="circle_memberships"
    )
    role = models.CharField(
        max_length=16, choices=Role.choices, default=Role.MEMBER
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("circle", "user")

    def __str__(self) -> str:
        return f"{self.user.username} in {self.circle.name} ({self.role})"


class Tag(models.Model):
    """
    A geospatial memory anchored to a physical location.
    - Viewers see the Teaser metadata on the shared map (when visibility='TEASER').
    - The full story and media attachments remain locked until the viewer physically
      visits within `unlock_radius_meters` of (`latitude`, `longitude`), which creates
      a permanent `TagUnlock` record for that viewer.
    """

    class Visibility(models.TextChoices):
        TEASER = (
            "TEASER",
            "Option A (Default): Teaser Pin on Map (Shows title & location; locks content until visited)",
        )
        HIDDEN = (
            "HIDDEN",
            "Option B: Hidden Surprise (Invisible on map until viewer walks within proximity)",
        )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    creator = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="created_tags"
    )
    circles = models.ManyToManyField(
        Circle,
        related_name="tags",
        help_text="Circles/groups that are invited to discover and unlock this tag.",
    )

    # Public/Teaser Metadata (Visible on the map before unlocking if TEASER)
    title = models.CharField(
        max_length=200,
        help_text="Name of the tag shown on the map pin (e.g., 'The House I Grew Up In').",
    )
    teaser_hint = models.CharField(
        max_length=280,
        blank=True,
        help_text="Optional short hint or clue shown on the locked pin (e.g., 'Stand by the old oak tree out front').",
    )
    address_label = models.CharField(
        max_length=255,
        blank=True,
        help_text="Human-readable address or landmark name.",
    )

    # Geospatial Coordinates (WGS84)
    latitude = models.FloatField(help_text="WGS84 Latitude in decimal degrees.")
    longitude = models.FloatField(help_text="WGS84 Longitude in decimal degrees.")
    unlock_radius_meters = models.PositiveIntegerField(
        default=75,
        help_text="Radius in meters within which a viewer must stand to unlock this memory.",
    )
    visibility = models.CharField(
        max_length=16,
        choices=Visibility.choices,
        default=Visibility.TEASER,
    )

    # Locked Memory Payload (Only returned to the creator or users who have unlocked the tag)
    story_text = models.TextField(
        blank=True,
        help_text="The full personal story or letter revealed when standing at this location.",
    )
    recorded_year = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Optional year the memory took place (e.g., 1988).",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.title} (@ {self.latitude:.4f}, {self.longitude:.4f}) by {self.creator.username}"


class TagMedia(models.Model):
    """Photo, audio recording, song, or video attached to a Tag."""

    class MediaType(models.TextChoices):
        IMAGE = "IMAGE", "Photo / Image"
        AUDIO = "AUDIO", "Voice Recording / Song (Audio)"
        VIDEO = "VIDEO", "Video Clip"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tag = models.ForeignKey(
        Tag, on_delete=models.CASCADE, related_name="media_items"
    )
    media_type = models.CharField(max_length=16, choices=MediaType.choices)
    file = models.FileField(upload_to="tag_media/%Y/%m/")
    caption = models.CharField(max_length=255, blank=True)
    file_size_bytes = models.PositiveBigIntegerField(default=0)
    duration_seconds = models.PositiveIntegerField(
        null=True, blank=True, help_text="Duration in seconds for audio or video."
    )
    display_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["display_order", "created_at"]

    def save(self, *args, **kwargs):
        if self.file and not self.file_size_bytes:
            try:
                self.file_size_bytes = self.file.size
            except Exception:
                pass
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.media_type} for '{self.tag.title}' ({self.caption or self.file.name})"


class TagUnlock(models.Model):
    """
    Records when a Viewer physically visits a Tag's location on mobile.
    Once created, this Tag is permanently unlocked for `user` on both the
    Mobile App and the End-User Web Portal.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tag = models.ForeignKey(
        Tag, on_delete=models.CASCADE, related_name="unlocks"
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="unlocked_tags"
    )
    unlocked_at = models.DateTimeField(auto_now_add=True)
    unlock_latitude = models.FloatField(
        help_text="Viewer's verified GPS latitude at the moment of unlock."
    )
    unlock_longitude = models.FloatField(
        help_text="Viewer's verified GPS longitude at the moment of unlock."
    )
    distance_meters = models.FloatField(
        default=0.0,
        help_text="Calculated distance in meters from the tag pin when unlocked.",
    )

    class Meta:
        unique_together = ("tag", "user")
        ordering = ["-unlocked_at"]

    def __str__(self) -> str:
        return f"{self.user.username} unlocked '{self.tag.title}' ({self.distance_meters:.1f}m)"


class CircleMessage(models.Model):
    """
    A message in a Circle's shared group chat.
    Can optionally reference a specific Tag on the map so family members
    can discuss memories or celebrate when someone unlocks a tag.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    circle = models.ForeignKey(
        Circle, on_delete=models.CASCADE, related_name="messages"
    )
    sender = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="sent_messages"
    )
    tag = models.ForeignKey(
        Tag,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="chat_messages",
        help_text="Optional Tag referenced by this chat message.",
    )
    text = models.TextField()
    is_system_event = models.BooleanField(
        default=False,
        help_text="True if automatically posted when a member creates or unlocks a tag.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"[{self.circle.name}] {self.sender.username}: {self.text[:50]}"
