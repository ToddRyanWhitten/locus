"""
Root URL configuration for Locus Backend.
Serves:
- /admin/          -> Customized Django Administrative Portal (Users, Storage Quotas, Log Viewer, Tags)
- /api/            -> REST API for End-User Web Portal and Mobile App (iOS/Android)
- /media/          -> Uploaded photos, audio recordings, and videos
"""

import re

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve

from core.admin_views import admin_log_viewer, admin_storage_dashboard

urlpatterns = [
    # Custom Admin Operations Views (Storage Analytics & Live Log Viewer)
    path("admin/operations/logs/", admin.site.admin_view(admin_log_viewer), name="admin-log-viewer"),
    path("admin/operations/storage/", admin.site.admin_view(admin_storage_dashboard), name="admin-storage-dashboard"),
    # Built-in Django Admin Portal
    path("admin/", admin.site.urls),
    # Locus REST API
    path("api/", include("core.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
elif settings.SERVE_MEDIA:
    # static() is a no-op when DEBUG is off, so wire the view up directly.
    urlpatterns += [
        re_path(
            r"^%s(?P<path>.*)$" % re.escape(settings.MEDIA_URL.lstrip("/")),
            serve,
            {"document_root": settings.MEDIA_ROOT},
        ),
    ]
