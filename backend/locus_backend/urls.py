"""
Root URL configuration for Locus Backend.
Serves:
- /admin/          -> Customized Django Administrative Portal (Users, Storage Quotas, Log Viewer, Tags)
- /api/            -> REST API for End-User Web Portal and Mobile App (iOS/Android)
- /media/          -> Uploaded photos, audio recordings, and videos
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

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
