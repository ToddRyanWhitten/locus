"""
Django Signals for Locus:
- Automatically create a `UserProfile` whenever a `User` is created.
- Log key audit events (user creation, tag creation, tag unlock, file deletion)
  to the `locus` logger so they appear in the Django Admin Log Viewer.
"""

import logging
from django.contrib.auth.models import User
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import Tag, TagMedia, TagUnlock, UserProfile

logger = logging.getLogger("locus")


@receiver(post_save, sender=User)
def create_or_update_user_profile(sender, instance: User, created: bool, **kwargs):
    if created:
        UserProfile.objects.get_or_create(
            user=instance,
            defaults={
                "display_name": instance.get_full_name() or instance.username,
            },
        )
        logger.info(f"Created new UserProfile for user '{instance.username}' (id={instance.id})")


@receiver(post_save, sender=Tag)
def log_tag_saved(sender, instance: Tag, created: bool, **kwargs):
    action = "Created" if created else "Updated"
    logger.info(
        f"{action} Tag '{instance.title}' (id={instance.id}) at "
        f"({instance.latitude:.5f}, {instance.longitude:.5f}) by user '{instance.creator.username}'"
    )


@receiver(post_save, sender=TagUnlock)
def log_tag_unlocked(sender, instance: TagUnlock, created: bool, **kwargs):
    if created:
        logger.info(
            f"GEOFENCE UNLOCK: User '{instance.user.username}' unlocked Tag '{instance.tag.title}' "
            f"from {instance.distance_meters:.1f}m away (radius={instance.tag.unlock_radius_meters}m)"
        )


@receiver(post_delete, sender=TagMedia)
def cleanup_media_file_on_delete(sender, instance: TagMedia, **kwargs):
    if instance.file:
        try:
            instance.file.delete(save=False)
            logger.info(f"Deleted media file for Tag '{instance.tag_id}' ({instance.file_size_bytes} bytes freed)")
        except Exception as exc:
            logger.warning(f"Failed to delete media file from storage: {exc}")
