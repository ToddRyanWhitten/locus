FROM python:3.12-slim

# Install GDAL, GEOS, and PROJ for GeoDjango + PostGIS
RUN apt-get update && apt-get install -y --no-install-recommends \
    binutils \
    libproj-dev \
    gdal-bin \
    libgdal-dev \
    libgeos-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Admin CSS/JS, served by WhiteNoise.
RUN python manage.py collectstatic --noinput

EXPOSE 8000

# Production server. Migrations run as a separate release step (see fly.toml);
# docker-compose overrides this with migrate + seed_demo + runserver for local dev.
CMD ["gunicorn", "locus_backend.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "120", "--access-logfile", "-"]
