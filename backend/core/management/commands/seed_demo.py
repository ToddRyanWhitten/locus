"""
Seeds the Locus database with:
- Recorder / Admin account: `todd` (password: `locus123`)
- Recorder / Admin account: `dad` (password: `locus123`) - used by the apps' quick-login buttons
- Daughter / Viewer account: `daughter` (password: `locus123`)
- A shared family Circle: "Family Landmarks & Childhood Memories" (Invite Code: `FAMILY26`)
- Three sample location-anchored Tags (one already unlocked by `daughter`, two waiting to be visited & unlocked!)
- Sample group chat messages in the Circle.
"""

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from core.models import (
    Circle,
    CircleMembership,
    CircleMessage,
    Tag,
    TagUnlock,
)


class Command(BaseCommand):
    help = "Seed Locus with demo users (todd, dad & daughter), a shared family circle, and sample geospatial tags."

    def handle(self, *args, **options):
        todd, created_todd = User.objects.get_or_create(
            username="todd",
            defaults={
                "email": "todd@locus.local",
                "first_name": "Todd",
                "last_name": "(Dad / Recorder)",
                "is_staff": True,
                "is_superuser": True,
            },
        )
        if created_todd:
            todd.set_password("locus123")
            todd.save()
            todd.profile.display_name = "Dad (Todd)"
            todd.profile.bio = "Leaving stories and photos across the places that shaped our family."
            todd.profile.storage_quota_mb = 1000
            todd.profile.save()

        daughter, created_daughter = User.objects.get_or_create(
            username="daughter",
            defaults={
                "email": "daughter@locus.local",
                "first_name": "Maya",
                "last_name": "(Daughter / Viewer)",
            },
        )
        if created_daughter:
            daughter.set_password("locus123")
            daughter.save()
            daughter.profile.display_name = "Maya (Daughter)"
            daughter.profile.bio = "Exploring Dad's footsteps and unlocking family memories."
            daughter.profile.save()

        dad, created_dad = User.objects.get_or_create(
            username="dad",
            defaults={
                "email": "dad@locus.local",
                "first_name": "Dad",
                "last_name": "(Recorder)",
                "is_staff": True,
                "is_superuser": True,
            },
        )
        if created_dad:
            dad.set_password("locus123")
            dad.save()
            dad.profile.display_name = "Dad"
            dad.profile.bio = "Leaving stories and photos across the places that shaped our family."
            dad.profile.storage_quota_mb = 1000
            dad.profile.save()

        circle, _= Circle.objects.get_or_create(
            invite_code="FAMILY26",
            defaults={
                "name": "Family Landmarks & Childhood Memories",
                "description": "Places from growing up, family road trips, and stories waiting to be unlocked in person.",
                "created_by": todd,
            },
        )

        CircleMembership.objects.get_or_create(
            circle=circle, user=todd, defaults={"role": CircleMembership.Role.ADMIN}
        )
        CircleMembership.objects.get_or_create(
            circle=circle, user=dad, defaults={"role": CircleMembership.Role.ADMIN}
        )
        CircleMembership.objects.get_or_create(
            circle=circle, user=daughter, defaults={"role": CircleMembership.Role.MEMBER}
        )

        if Tag.objects.count() == 0:
            tag1 = Tag.objects.create(
                creator=todd,
                title="The House I Grew Up In",
                teaser_hint="Stand near the front sidewalk by the big maple tree to unlock this memory.",
                address_label="742 Evergreen Terrace (Childhood Home)",
                latitude=38.8977,
                longitude=-77.0365,
                unlock_radius_meters=75,
                visibility=Tag.Visibility.TEASER,
                recorded_year=1986,
                story_text=(
                    "Even though another family lives here now, this porch is where I spent every summer evening "
                    "listening to baseball games on the radio with your grandfather. Look at the second-floor window "
                    "on the left—that was my bedroom where I built my first computer!"
                ),
            )
            tag1.circles.add(circle)

            tag2 = Tag.objects.create(
                creator=todd,
                title="Where I Learned to Ride a Bike",
                teaser_hint="Walk to the south end of the park path near the old stone bench.",
                address_label="Riverside Park South Path",
                latitude=38.8895,
                longitude=-77.0353,
                unlock_radius_meters=100,
                visibility=Tag.Visibility.TEASER,
                recorded_year=1982,
                story_text=(
                    "Right on this gentle hill is where my dad finally let go of the back of my Schwinn bicycle. "
                    "I coasted all the way down to the fountain without realizing he wasn't holding on anymore. "
                    "Years later, I brought you to a park just like this one!"
                ),
            )
            tag2.circles.add(circle)

            tag3 = Tag.objects.create(
                creator=todd,
                title="Our Favorite Saturday Morning Bakery",
                teaser_hint="Right outside the corner bakery entrance!",
                address_label="Cornerstone Bakery & Cafe",
                latitude=38.8951,
                longitude=-77.0364,
                unlock_radius_meters=60,
                visibility=Tag.Visibility.TEASER,
                recorded_year=2014,
                story_text=(
                    "When you were five years old, we walked here every Saturday morning for cinnamon rolls. "
                    "You always insisted on sitting at the window table so you could wave at every dog that walked by."
                ),
            )
            tag3.circles.add(circle)

            # Pre-unlock tag3 for daughter so you can immediately see the difference between
            # Locked Teaser Pins (tag1 & tag2) and an Unlocked Memory (tag3) on the Web & Mobile apps!
            TagUnlock.objects.get_or_create(
                tag=tag3,
                user=daughter,
                defaults={
                    "unlock_latitude": 38.8951,
                    "unlock_longitude": -77.0364,
                    "distance_meters": 8.4,
                },
            )

            CircleMessage.objects.create(
                circle=circle,
                sender=todd,
                tag=tag1,
                text="I just tagged the house I grew up in! Next time you're in town, walk by the front sidewalk with the app open.",
                is_system_event=False,
            )
            CircleMessage.objects.create(
                circle=circle,
                sender=daughter,
                tag=tag3,
                text="I walked past the old bakery today and unlocked the memory! Reading that while standing at the window made my whole week ❤️",
                is_system_event=False,
            )

        self.stdout.write(
            self.style.SUCCESS(
                "Locus demo data ready! Logins: 'dad' or 'todd' / 'locus123' (Recorder & Admin) or 'daughter' / 'locus123' (Viewer)."
            )
        )
