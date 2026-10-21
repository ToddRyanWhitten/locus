"""
Custom Django Admin Views for Locus System Operations:
1. /admin/operations/logs/    -> Live Application & Geofence Audit Log Viewer (with level/keyword filtering)
2. /admin/operations/storage/ -> User Storage Quota & Media Breakdown Dashboard
"""

import logging
from django.conf import settings
from django.contrib import admin, messages
from django.contrib.auth.models import User
from django.db.models import Count, Sum
from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect, render

from .models import TagMedia, UserProfile

logger = logging.getLogger("locus")


def admin_log_viewer(request: HttpRequest) -> HttpResponse:
    """
    Renders a searchable, filterable application log viewer inside the Django Admin portal.
    Allows admins to inspect geofence unlock events, API activity, and system errors,
    or clear rotated logs.
    """
    log_path = settings.LOG_FILE_PATH
    level_filter = request.GET.get("level", "").upper().strip()
    search_query = request.GET.get("q", "").strip()
    line_limit = int(request.GET.get("limit", "250"))

    if request.method == "POST" and request.POST.get("action") == "clear_logs":
        try:
            with open(log_path, "w", encoding="utf-8") as f:
                f.write("")
            logger.info(f"Application log cleared by admin '{request.user.username}'")
            messages.success(request, "Application log file cleared.")
        except Exception as exc:
            messages.error(request, f"Could not clear log file: {exc}")
        return redirect("admin-log-viewer")

    lines = []
    if log_path.exists():
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            raw_lines = f.readlines()
        # Most recent logs first
        for line in reversed(raw_lines):
            text = line.rstrip("\n")
            if not text:
                continue
            if level_filter and f" {level_filter} " not in text and f"]{level_filter}" not in text:
                if level_filter not in text:
                    continue
            if search_query and search_query.lower() not in text.lower():
                continue
            lines.append(text)
            if len(lines) >= line_limit:
                break

    context = {
        **admin.site.each_context(request),
        "title": "Application & Geofence Audit Log Viewer",
        "log_lines": lines,
        "log_file_path": str(log_path),
        "level_filter": level_filter,
        "search_query": search_query,
        "line_limit": line_limit,
    }
    return render(request, "admin/operations_logs.html", context)


def admin_storage_dashboard(request: HttpRequest) -> HttpResponse:
    """
    Renders a comprehensive Storage Management Dashboard inside Django Admin.
    Shows per-user quota consumption, media type breakdowns (Images vs Audio vs Video),
    and lets admins update user quotas in one click.
    """
    if request.method == "POST":
        user_id = request.POST.get("user_id")
        new_quota = request.POST.get("storage_quota_mb")
        if user_id and new_quota:
            try:
                profile, _ = UserProfile.objects.get_or_create(user_id=int(user_id))
                profile.storage_quota_mb = max(1, int(new_quota))
                profile.save()
                logger.info(
                    f"Admin '{request.user.username}' updated storage quota for "
                    f"'{profile.user.username}' to {profile.storage_quota_mb} MB"
                )
                messages.success(
                    request,
                    f"Updated storage quota for {profile.user.username} to {profile.storage_quota_mb} MB.",
                )
            except Exception as exc:
                messages.error(request, f"Failed to update quota: {exc}")
        return redirect("admin-storage-dashboard")

    users = User.objects.select_related("profile").all().order_by("username")
    media_summary = (
        TagMedia.objects.values("media_type")
        .annotate(count=Count("id"), total_bytes=Sum("file_size_bytes"))
        .order_by("media_type")
    )

    total_system_bytes = (
        TagMedia.objects.aggregate(total=Sum("file_size_bytes"))["total"] or 0
    )

    context = {
        **admin.site.each_context(request),
        "title": "Storage Quotas & Media Analytics",
        "users": users,
        "media_summary": media_summary,
        "total_system_mb": round(total_system_bytes / (1024 * 1024), 2),
        "total_media_files": TagMedia.objects.count(),
    }
    return render(request, "admin/operations_storage.html", context)
