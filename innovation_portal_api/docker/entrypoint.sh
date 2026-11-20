#!/bin/sh
set -e

# Celery worker/beat (and one-off commands) pass their own command; run it directly.
if [ "$#" -gt 0 ]; then
    exec "$@"
fi

# Backend web container: prepare the app, then serve it.
python manage.py migrate --noinput
python manage.py collectstatic --noinput
python manage.py bootstrap_admin

exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "${GUNICORN_WORKERS:-3}" \
    --timeout "${GUNICORN_TIMEOUT:-120}" \
    --access-logfile - \
    --error-logfile -
