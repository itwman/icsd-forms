from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("panel/", include("apps.panel.urls", namespace="panel")),
    path("django-admin/", admin.site.urls),
    path("accounts/", include("apps.accounts.urls", namespace="accounts")),
    path("app/team/", include("apps.teams.urls", namespace="teams")),
    path("app/billing/", include("apps.billing.urls", namespace="billing")),
    path("", include("apps.surveys.urls", namespace="surveys")),
    path("", include("apps.core.urls", namespace="core")),
]
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

handler404 = "apps.core.views.page_not_found"
