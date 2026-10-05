from django.urls import path

from . import views

app_name = "billing"
urlpatterns = [
    path("", views.billing, name="billing"),
    path("checkout/", views.checkout, name="checkout"),
    path("callback/", views.callback, name="callback"),
]
