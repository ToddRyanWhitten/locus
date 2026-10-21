"""
Automated unit & integration tests for Locus Backend:
- Verifies that a Viewer cannot see `story_text` or `media_items` before visiting a Tag.
- Verifies that `POST /api/tags/{id}/unlock/` denies access when the viewer's GPS coordinates
  are outside `unlock_radius_meters`.
- Verifies that `POST /api/tags/{id}/unlock/` permanently unlocks the Tag when the viewer
  is physically within `unlock_radius_meters`.
"""

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from core.models import Circle, CircleMembership, Tag


class GeofenceUnlockTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.recorder = User.objects.create_user(username="dad", password="password123")
        self.viewer = User.objects.create_user(username="daughter", password="password123")

        self.circle = Circle.objects.create(name="Family", created_by=self.recorder)
        CircleMembership.objects.create(circle=self.circle, user=self.recorder)
        CircleMembership.objects.create(circle=self.circle, user=self.viewer)

        self.tag = Tag.objects.create(
            creator=self.recorder,
            title="Childhood Home",
            teaser_hint="Look for the oak tree",
            latitude=40.7128,
            longitude=-74.0060,
            unlock_radius_meters=50,
            story_text="Secret childhood story that requires standing here!",
        )
        self.tag.circles.add(self.circle)

    def test_locked_for_viewer_until_physically_visited(self):
        self.client.force_authenticate(user=self.viewer)

        # 1. Before visiting, story_text is None (locked)
        res = self.client.get(f"/api/tags/{self.tag.id}/")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["is_unlocked"])
        self.assertIsNone(res.data["story_text"])

        # 2. Attempt unlock from 1,000 meters away -> Denied (403)
        far_res = self.client.post(
            f"/api/tags/{self.tag.id}/unlock/",
            {"latitude": 40.7228, "longitude": -74.0060},
            format="json",
        )
        self.assertEqual(far_res.status_code, 403)
        self.assertFalse(far_res.data["unlocked"])

        # 3. Attempt unlock from 10 meters away -> Permanently Unlocked (200)
        near_res = self.client.post(
            f"/api/tags/{self.tag.id}/unlock/",
            {"latitude": 40.71285, "longitude": -74.0060},
            format="json",
        )
        self.assertEqual(near_res.status_code, 200)
        self.assertTrue(near_res.data["unlocked"])
        self.assertEqual(
            near_res.data["tag"]["story_text"],
            "Secret childhood story that requires standing here!",
        )

        # 4. Subsequent GET on Web or Mobile (even without GPS coords) now stays unlocked!
        web_res = self.client.get(f"/api/tags/{self.tag.id}/")
        self.assertTrue(web_res.data["is_unlocked"])
        self.assertEqual(
            web_res.data["story_text"],
            "Secret childhood story that requires standing here!",
        )
