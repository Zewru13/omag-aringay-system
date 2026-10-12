"""
ASGI config for oma_aringay project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

# A real server runs the hardened settings unless explicitly told otherwise.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'oma_aringay.settings_production')

application = get_asgi_application()
