from django.apps import AppConfig


class AssociationsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'associations'

    def ready(self):
        from .import_undo_hooks import register
        register()
