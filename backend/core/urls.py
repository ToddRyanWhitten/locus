from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CircleViewSet,
    TagViewSet,
    current_user_profile,
    login_user,
    register_user,
)

router = DefaultRouter()
router.register(r"circles", CircleViewSet, basename="circle")
router.register(r"tags", TagViewSet, basename="tag")

urlpatterns = [
    path("auth/register/", register_user, name="auth-register"),
    path("auth/login/", login_user, name="auth-login"),
    path("auth/me/", current_user_profile, name="auth-me"),
    path("", include(router.urls)),
]
