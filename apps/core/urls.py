from django.urls import path

from . import views

app_name = "core"
urlpatterns = [
    path("", views.home, name="home"),
    path("pricing/", views.pricing, name="pricing"),
    path("templates/", views.templates, name="templates"),
    path("p/<str:slug>/", views.page, name="page"),
]
