from django.urls import path
from django.views.generic import RedirectView

from . import crud, pages

app_name = "panel"

urlpatterns = [
    path("", pages.dashboard, name="dashboard"),
    path("login/", RedirectView.as_view(url="/accounts/login/?next=/panel/"), name="login"),
    path("media/", pages.media, name="media"),
    path("media/upload/", pages.media_upload, name="media_upload"),
    path("media/delete/", pages.media_delete, name="media_delete"),
    path("media/mkdir/", pages.media_mkdir, name="media_mkdir"),
    path("roles/", pages.roles, name="roles"),
    path("roles/add/", pages.role_edit, name="role_add"),
    path("roles/<int:pk>/", pages.role_edit, name="role_edit"),
    path("activity/", pages.activity, name="activity"),
    path("tools/", pages.tools, name="tools"),
    path("search/", pages.search, name="search"),
    path("api/ac/<str:key>/", crud.autocomplete_api, name="ac"),
    path("r/<str:key>/", crud.list_view, name="list"),
    path("r/<str:key>/add/", crud.edit_view, name="add"),
    path("r/<str:key>/reorder/", crud.reorder_api, name="reorder"),
    path("r/<str:key>/<int:pk>/", crud.edit_view, name="edit"),
    path("r/<str:key>/<int:pk>/delete/", crud.delete_view, name="delete"),
    path("r/<str:key>/<int:pk>/duplicate/", crud.duplicate_view, name="duplicate"),
    path("r/<str:key>/<int:pk>/toggle/<str:field>/", crud.toggle_api, name="toggle"),
    path("r/<str:key>/<int:pk>/set/<str:field>/", crud.setchoice_api, name="setchoice"),
]
