"""
Customized Django Administrative Portal for Locus.

Provides:
- User & UserProfile management with live storage quota usage bars.
- Circle & CircleMembership administration.
- Tag & TagMedia inline management with direct Google Maps links.
- TagUnlock audit trail showing who unlocked which memory, when, and from what GPS distance.
- Quick navigation links in the Admin header to the Custom Storage Dashboard and Live Application Log Viewer.
"""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from django.utils.html import format_html

from .models import (
    Circle,
    CircleMembership,
    CircleMessage,
    Tag,
    TagMedia,
    TagUnlock,
    UserProfile,
)

admin.site.site_header = "Locus Administration Portal"
admin.site.site_title = "Locus Admin"
admin.site.index_title = "System Operations, User Profiles, Storage & Geospatial Memories"


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = "Locus Profile & Storage Quota"
    readonly_fields = ("storage_usage_display",)
    fields = ("display_name", "bio", "avatar_url", "storage_quota_mb", "storage_usage_display")

    def storage_usage_display(self, obj: UserProfile):
        if not obj or not obj.pk:
            return "0 MB"
        pct = min(obj.storage_usage_percent, 100)
        color = "#10b981" if pct < 75 else ("#f59e0b" if pct < 90 else "#ef4444")
        return format_html(
            '<div style="width:240px;background:#e5e7eb;border-radius:6px;overflow:hidden;height:14px;display:inline-block;vertical-align:middle;margin-right:8px;">'
            '<div style="width:{}%;background:{};height:100%;"></div></div>'
            "<strong>{} MB</strong> / {} MB ({}%)",
            pct,
            color,
            obj.storage_used_mb,
            obj.storage_quota_mb,
            obj.storage_usage_percent,
        )

    storage_usage_display.short_description = "Current Storage Usage"


class CustomUserAdmin(BaseUserAdmin):
    inlines = (UserProfileInline,)
    list_display = (
        "username",
        "email",
        "display_name",
        "tags_created_count",
        "tags_unlocked_count",
        "storage_summary",
        "is_staff",
    )

    def display_name(self, obj: User):
        profile = getattr(obj, "profile", None)
        return profile.display_name if profile else obj.username

    def tags_created_count(self, obj: User):
        return obj.created_tags.count()

    tags_created_count.short_description = "Tags Recorded"

    def tags_unlocked_count(self, obj: User):
        return obj.unlocked_tags.count()

    tags_unlocked_count.short_description = "Memories Unlocked"

    def storage_summary(self, obj: User):
        profile = getattr(obj, "profile", None)
        if not profile:
            return "—"
        return f"{profile.storage_used_mb} / {profile.storage_quota_mb} MB ({profile.storage_usage_percent}%)"

    storage_summary.short_description = "Storage Used"


# Re-register User with our enhanced profile & storage quota inline
admin.site.unregister(User)
admin.site.register(User, CustomUserAdmin)


class CircleMembershipInline(admin.TabularInline):
    model = CircleMembership
    extra = 1


@admin.register(Circle)
class CircleAdmin(admin.ModelAdmin):
    list_display = ("name", "invite_code", "created_by", "member_count", "tag_count", "created_at")
    search_fields = ("name", "invite_code", "description")
    inlines = [CircleMembershipInline]

    def member_count(self, obj: Circle):
        return obj.memberships.count()

    member_count.short_description = "Members"

    def tag_count(self, obj: Circle):
        return obj.tags.count()

    tag_count.short_description = "Shared Tags"


class TagMediaInline(admin.TabularInline):
    model = TagMedia
    extra = 1
    readonly_fields = ("file_size_bytes", "created_at")


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = (
        "title",
        "creator",
        "visibility",
        "unlock_radius_meters",
        "recorded_year",
        "media_count",
        "unlock_count",
        "google_maps_link",
        "created_at",
    )
    list_filter = ("visibility", "recorded_year", "circles", "created_at")
    search_fields = ("title", "teaser_hint", "story_text", "address_label", "creator__username")
    filter_horizontal = ("circles",)
    inlines = [TagMediaInline]

    def media_count(self, obj: Tag):
        return obj.media_items.count()

    media_count.short_description = "Media Files"

    def unlock_count(self, obj: Tag):
        return obj.unlocks.count()

    unlock_count.short_description = "Times Unlocked"

    def google_maps_link(self, obj: Tag):
        url = f"https://www.google.com/maps/search/?api=1&query={obj.latitude},{obj.longitude}"
        return format_html(
            '<a href="{}" target="_blank" rel="noopener">📍 {:.4f}, {:.4f}</a>',
            url,
            obj.latitude,
            obj.longitude,
        )

    google_maps_link.short_description = "Map Location"


@admin.register(TagMedia)
class TagMediaAdmin(admin.ModelAdmin):
    list_display = ("tag", "media_type", "caption", "size_kb", "duration_seconds", "created_at")
    list_filter = ("media_type", "created_at")
    search_fields = ("caption", "tag__title", "tag__creator__username")

    def size_kb(self, obj: TagMedia):
        return f"{round(obj.file_size_bytes / 1024, 1)} KB"

    size_kb.short_description = "File Size"


@admin.register(TagUnlock)
class TagUnlockAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "tag",
        "distance_meters",
        "unlock_coordinates",
        "unlocked_at",
    )
    list_filter = ("unlocked_at", "user")
    search_fields = ("user__username", "tag__title")
    readonly_fields = ("unlocked_at",)

    def unlock_coordinates(self, obj: TagUnlock):
        return f"{obj.unlock_latitude:.5f}, {obj.unlock_longitude:.5f}"


@admin.register(CircleMessage)
class CircleMessageAdmin(admin.ModelAdmin):
    list_display = ("circle", "sender", "short_text", "tag", "is_system_event", "created_at")
    list_filter = ("circle", "is_system_event", "created_at")
    search_fields = ("text", "sender__username", "circle__name")

    def short_text(self, obj: CircleMessage):
        return obj.text[:75] + ("..." if len(obj.text) > 75 else "")
