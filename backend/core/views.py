"""
REST API Views for Locus.

Provides endpoints for:
- Authentication & User switching (including quick demo user login for testing Recorder vs. Daughter/Viewer flows).
- Circle management, invite code joining, and Circle Group Chat messages.
- Tag creation, editing, deletion, media upload, and Geofence Proximity Unlocking.
"""

import logging
from django.contrib.auth.models import User
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .geo import calculate_distance_meters
from .models import (
    Circle,
    CircleMembership,
    CircleMessage,
    Tag,
    TagMedia,
    TagUnlock,
    UserProfile,
)
from .serializers import (
    CircleMessageSerializer,
    CircleSerializer,
    TagCreateUpdateSerializer,
    TagMediaSerializer,
    TagSerializer,
    UserBriefSerializer,
)

logger = logging.getLogger("locus")


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def register_user(request):
    """Register a new user account and return JWT tokens."""
    username = (request.data.get("username") or "").strip()
    email = (request.data.get("email") or "").strip()
    password = request.data.get("password") or ""
    display_name = (request.data.get("display_name") or username).strip()

    if not username or not password:
        return Response(
            {"error": "Username and password are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if User.objects.filter(username__iexact=username).exists():
        return Response(
            {"error": "A user with that username already exists."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = User.objects.create_user(username=username, email=email, password=password)
    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.display_name = display_name
    profile.save()

    refresh = RefreshToken.for_user(user)
    return Response(
        {
            "user": UserBriefSerializer(user).data,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def login_user(request):
    """Authenticate with username & password and receive JWT tokens + user profile."""
    from django.contrib.auth import authenticate

    username = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""

    user = authenticate(request, username=username, password=password)
    if not user:
        return Response(
            {"error": "Invalid username or password."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    refresh = RefreshToken.for_user(user)
    logger.info(f"User '{user.username}' signed in via API")
    return Response(
        {
            "user": UserBriefSerializer(user).data,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
        }
    )


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def current_user_profile(request):
    """Return the authenticated user's profile and storage quota metrics."""
    return Response(UserBriefSerializer(request.user).data)


class CircleViewSet(viewsets.ModelViewSet):
    """
    Manage shared family/friend Circles, invite codes, and group chat messages.
    """

    serializer_class = CircleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            Circle.objects.filter(members=self.request.user)
            .prefetch_related("memberships__user__profile", "tags")
            .distinct()
        )

    def perform_create(self, serializer):
        circle = serializer.save(created_by=self.request.user)
        CircleMembership.objects.create(
            circle=circle,
            user=self.request.user,
            role=CircleMembership.Role.ADMIN,
        )
        CircleMessage.objects.create(
            circle=circle,
            sender=self.request.user,
            text=f"Created the '{circle.name}' memory circle.",
            is_system_event=True,
        )

    @action(detail=False, methods=["post"])
    def join(self, request):
        """Join a Circle using its invite code."""
        invite_code = (request.data.get("invite_code") or "").strip().upper()
        circle = Circle.objects.filter(invite_code__iexact=invite_code).first()
        if not circle:
            return Response(
                {"error": "No Circle found with that invite code."},
                status=status.HTTP_404_NOT_FOUND,
            )

        membership, created = CircleMembership.objects.get_or_create(
            circle=circle,
            user=request.user,
            defaults={"role": CircleMembership.Role.MEMBER},
        )
        if created:
            CircleMessage.objects.create(
                circle=circle,
                sender=request.user,
                text=f"{request.user.profile.display_name or request.user.username} joined the circle!",
                is_system_event=True,
            )
            logger.info(f"User '{request.user.username}' joined Circle '{circle.name}'")

        return Response(CircleSerializer(circle, context={"request": request}).data)

    @action(detail=True, methods=["get", "post"])
    def messages(self, request, pk=None):
        """Get or post group chat messages for this Circle."""
        circle = self.get_object()
        if request.method == "GET":
            msgs = circle.messages.select_related("sender__profile", "tag").all()[:150]
            return Response(
                CircleMessageSerializer(msgs, many=True, context={"request": request}).data
            )

        text = (request.data.get("text") or "").strip()
        tag_id = request.data.get("tag_id")
        if not text:
            return Response(
                {"error": "Message text cannot be empty."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        linked_tag = Tag.objects.filter(id=tag_id).first() if tag_id else None
        msg = CircleMessage.objects.create(
            circle=circle,
            sender=request.user,
            tag=linked_tag,
            text=text,
            is_system_event=False,
        )
        return Response(
            CircleMessageSerializer(msg, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class TagViewSet(viewsets.ModelViewSet):
    """
    Create, edit, delete, list, and geofence-unlock location Tags.
    """

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        user = self.request.user
        circle_id = self.request.query_params.get("circle_id")

        qs = (
            Tag.objects.filter(Q(creator=user) | Q(circles__members=user))
            .select_related("creator__profile")
            .prefetch_related("media_items", "circles", "unlocks")
            .distinct()
        )
        if circle_id:
            qs = qs.filter(circles__id=circle_id)
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        user = self.request.user
        if user.is_authenticated:
            ctx["unlocked_tag_ids"] = set(
                TagUnlock.objects.filter(user=user).values_list("tag_id", flat=True)
            )
        lat_str = self.request.query_params.get("lat")
        lon_str = self.request.query_params.get("lng") or self.request.query_params.get("lon")
        if lat_str is not None and lon_str is not None:
            try:
                ctx["viewer_lat"] = float(lat_str)
                ctx["viewer_lon"] = float(lon_str)
            except ValueError:
                pass
        return ctx

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return TagCreateUpdateSerializer
        return TagSerializer

    def list(self, request, *args, **kwargs):
        """
        Return Tags visible to the user.
        Note on Option B (`visibility == 'HIDDEN'`):
        Hidden tags are still returned if:
        1. The user is the creator, OR
        2. The user has already unlocked the tag, OR
        3. The user's current GPS coordinates (`?lat=...&lng=...`) are within 3x the unlock radius
           (or inside the unlock radius) so the mobile app can trigger a nearby surprise alert!
        """
        queryset = self.filter_queryset(self.get_queryset())
        ctx = self.get_serializer_context()
        unlocked_ids = ctx.get("unlocked_tag_ids", set())
        viewer_lat = ctx.get("viewer_lat")
        viewer_lon = ctx.get("viewer_lon")

        visible_tags = []
        for tag in queryset:
            if tag.visibility == Tag.Visibility.HIDDEN:
                is_owner_or_unlocked = (
                    tag.creator_id == request.user.id or tag.id in unlocked_ids
                )
                is_nearby = False
                if viewer_lat is not None and viewer_lon is not None:
                    dist = calculate_distance_meters(
                        viewer_lat, viewer_lon, tag.latitude, tag.longitude
                    )
                    # Reveal hidden surprise pin when within unlock_radius_meters * 1.5
                    is_nearby = dist <= (tag.unlock_radius_meters * 1.5)
                if not (is_owner_or_unlocked or is_nearby):
                    continue
            visible_tags.append(tag)

        serializer = TagSerializer(visible_tags, many=True, context=ctx)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tag = serializer.save(creator=request.user)

        # If no circle_ids were explicitly passed, attach to the user's circles by default
        if not tag.circles.exists():
            user_circles = Circle.objects.filter(members=request.user)
            tag.circles.set(user_circles)

        # Post a celebratory system message to each shared Circle's group chat
        for circle in tag.circles.all():
            teaser_note = (
                f"📍 {request.user.profile.display_name or request.user.username} "
                f"tagged a new memory: '{tag.title}'"
                if tag.visibility == Tag.Visibility.TEASER
                else f"🤫 {request.user.profile.display_name or request.user.username} "
                f"hid a surprise memory somewhere in the world!"
            )
            CircleMessage.objects.create(
                circle=circle,
                sender=request.user,
                tag=tag if tag.visibility == Tag.Visibility.TEASER else None,
                text=teaser_note,
                is_system_event=True,
            )

        output = TagSerializer(tag, context=self.get_serializer_context()).data
        return Response(output, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        tag = self.get_object()
        if tag.creator_id != request.user.id and not request.user.is_staff:
            return Response(
                {"error": "Only the creator of a tag can edit it."},
                status=status.HTTP_403_FORBIDDEN,
            )
        partial = kwargs.pop("partial", False)
        serializer = self.get_serializer(tag, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        tag = serializer.save()
        return Response(TagSerializer(tag, context=self.get_serializer_context()).data)

    def destroy(self, request, *args, **kwargs):
        tag = self.get_object()
        if tag.creator_id != request.user.id and not request.user.is_staff:
            return Response(
                {"error": "Only the creator of a tag can delete it."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    def unlock(self, request, pk=None):
        """
        Geofence Gatekeeper Endpoint (`POST /api/tags/{id}/unlock/`).
        Requires `latitude` and `longitude` in the request body.
        Verifies the viewer is physically within `tag.unlock_radius_meters`
        of the Tag's coordinates. Once verified, creates a permanent `TagUnlock`
        record so the memory is unlocked on both Mobile and the End-User Web Portal!
        """
        tag = self.get_object()
        lat = request.data.get("latitude")
        lon = request.data.get("longitude")

        if lat is None or lon is None:
            return Response(
                {"error": "Current GPS latitude and longitude are required to unlock a tag."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            viewer_lat = float(lat)
            viewer_lon = float(lon)
        except ValueError:
            return Response(
                {"error": "Invalid GPS coordinates."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        distance_m = calculate_distance_meters(
            viewer_lat, viewer_lon, tag.latitude, tag.longitude
        )

        if distance_m > tag.unlock_radius_meters:
            logger.warning(
                f"GEOFENCE DENIED: User '{request.user.username}' attempted to unlock "
                f"'{tag.title}' from {distance_m:.1f}m away (required <= {tag.unlock_radius_meters}m)"
            )
            return Response(
                {
                    "unlocked": False,
                    "distance_meters": distance_m,
                    "unlock_radius_meters": tag.unlock_radius_meters,
                    "meters_remaining": round(distance_m - tag.unlock_radius_meters, 1),
                    "error": (
                        f"You are {distance_m:.0f}m away from '{tag.title}'. "
                        f"Walk within {tag.unlock_radius_meters}m to unlock this memory!"
                    ),
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        unlock_obj, created = TagUnlock.objects.get_or_create(
            tag=tag,
            user=request.user,
            defaults={
                "unlock_latitude": viewer_lat,
                "unlock_longitude": viewer_lon,
                "distance_meters": distance_m,
            },
        )

        if created:
            for circle in tag.circles.all():
                CircleMessage.objects.create(
                    circle=circle,
                    sender=request.user,
                    tag=tag,
                    text=(
                        f"🔓 {request.user.profile.display_name or request.user.username} "
                        f"visited and unlocked '{tag.title}' ({distance_m:.0f}m from pin)!"
                    ),
                    is_system_event=True,
                )

        ctx = self.get_serializer_context()
        ctx["viewer_lat"] = viewer_lat
        ctx["viewer_lon"] = viewer_lon
        if "unlocked_tag_ids" in ctx:
            ctx["unlocked_tag_ids"].add(tag.id)

        return Response(
            {
                "unlocked": True,
                "newly_unlocked": created,
                "distance_meters": distance_m,
                "tag": TagSerializer(tag, context=ctx).data,
            }
        )

    @action(
        detail=True,
        methods=["post"],
        parser_classes=[MultiPartParser, FormParser],
    )
    def upload_media(self, request, pk=None):
        """
        Attach an image, audio recording/song, or video file to a Tag.
        Enforces the creator's storage quota configured in the Django Admin Portal.
        """
        tag = self.get_object()
        if tag.creator_id != request.user.id and not request.user.is_staff:
            return Response(
                {"error": "Only the tag creator can upload media to this tag."},
                status=status.HTTP_403_FORBIDDEN,
            )

        uploaded_file = request.FILES.get("file")
        if not uploaded_file:
            return Response(
                {"error": "No media file provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        projected_bytes = profile.storage_used_bytes + uploaded_file.size
        quota_bytes = profile.storage_quota_mb * 1024 * 1024
        if projected_bytes > quota_bytes:
            return Response(
                {
                    "error": (
                        f"Upload exceeds your storage quota of {profile.storage_quota_mb} MB "
                        f"(currently using {profile.storage_used_mb} MB)."
                    )
                },
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        media_type = (request.data.get("media_type") or "").upper()
        if media_type not in TagMedia.MediaType.values:
            content_type = getattr(uploaded_file, "content_type", "") or ""
            if content_type.startswith("audio/"):
                media_type = TagMedia.MediaType.AUDIO
            elif content_type.startswith("video/"):
                media_type = TagMedia.MediaType.VIDEO
            else:
                media_type = TagMedia.MediaType.IMAGE

        caption = (request.data.get("caption") or "").strip()
        duration_seconds = request.data.get("duration_seconds")

        media = TagMedia.objects.create(
            tag=tag,
            media_type=media_type,
            file=uploaded_file,
            caption=caption,
            file_size_bytes=uploaded_file.size,
            duration_seconds=int(duration_seconds) if duration_seconds else None,
        )
        logger.info(
            f"Uploaded {media_type} ({uploaded_file.size} bytes) to Tag '{tag.title}' "
            f"by '{request.user.username}'"
        )
        return Response(
            TagMediaSerializer(media, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["delete"],
        url_path="media/(?P<media_id>[^/.]+)",
    )
    def delete_media(self, request, pk=None, media_id=None):
        """Delete a media item from a Tag."""
        tag = self.get_object()
        if tag.creator_id != request.user.id and not request.user.is_staff:
            return Response(
                {"error": "Only the tag creator can remove media."},
                status=status.HTTP_403_FORBIDDEN,
            )
        media = get_object_or_404(TagMedia, id=media_id, tag=tag)
        media.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
