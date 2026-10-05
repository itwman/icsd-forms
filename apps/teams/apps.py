from django.apps import AppConfig


class TeamsConfig(AppConfig):
    name = "apps.teams"
    verbose_name = "فضاهای کاری و تیم"

    def ready(self):
        from . import signals  # noqa: F401
