"""
Geospatial utility functions for Locus.

Provides exact geodesic distance calculations (in meters) between two WGS84
coordinates (latitude, longitude). When running with PostGIS enabled, GeoDjango
ST_DistanceSphere / ST_DWithin can also be used directly at the database level.
"""

import math


def calculate_distance_meters(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> float:
    """
    Calculate the great-circle distance in meters between two points
    on the Earth's surface specified in decimal degrees (WGS84).
    """
    earth_radius_meters = 6371008.8  # Mean Earth radius in meters (IUGG)

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    return round(earth_radius_meters * c, 2)
