from django.urls import path

from . import views_app as a
from . import views_public as p
from . import views_results as r

app_name = "surveys"
urlpatterns = [
    path("app/", a.dashboard, name="dashboard"),
    path("app/new/", a.new, name="new"),
    path("app/folders/", a.folders, name="folders"),
    path("app/s/<int:pk>/action/", a.action, name="action"),
    path("app/s/<int:pk>/edit/", a.edit, name="edit"),
    path("app/s/<int:pk>/settings/", a.settings_view, name="settings"),
    path("app/s/<int:pk>/share/", a.share, name="share"),
    path("app/s/<int:pk>/qr/", a.qr, name="qr"),
    path("app/s/<int:pk>/results/", r.results, name="results"),
    path("app/s/<int:pk>/responses/", r.responses, name="responses"),
    path("app/s/<int:pk>/responses/<int:rid>/", r.response_detail, name="response"),
    path("app/s/<int:pk>/export.<str:fmt>", r.export, name="export"),
    path("app/s/<int:pk>/clear-tests/", r.clear_tests, name="clear_tests"),
    path("api/s/<int:pk>/save/", a.api_save, name="api_save"),
    path("api/s/<int:pk>/publish/", a.api_publish, name="api_publish"),
    path("api/s/<int:pk>/image/", a.api_image, name="api_image"),
    path("f/<str:code>/", p.fill, name="fill"),
    path("f/<str:code>/preview/", p.preview, name="preview"),
    path("f/<str:code>/start/", p.f_start, name="f_start"),
    path("f/<str:code>/save/", p.f_save, name="f_save"),
    path("f/<str:code>/submit/", p.f_submit, name="f_submit"),
    path("f/<str:code>/upload/", p.f_upload, name="f_upload"),
    path("f/<str:code>/otp/", p.f_otp, name="f_otp"),
    path("t/<str:slug>/", p.template_preview, name="template_preview"),
    path("embed.js", p.embed_js, name="embed"),
]
