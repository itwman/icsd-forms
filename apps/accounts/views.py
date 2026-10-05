from django.contrib import messages
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.decorators import login_required
from django.core.cache import cache
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_POST

from .forms import MobileForm, OTPForm, PasswordLoginForm, ProfileForm, SetPasswordForm
from .models import OTP
from .sms import send_otp

User = get_user_model()


def _next(request):
    nxt = request.GET.get("next") or request.POST.get("next") or request.session.get("next") or ""
    if nxt and url_has_allowed_host_and_scheme(nxt, allowed_hosts={request.get_host()}):
        return nxt
    return reverse("surveys:dashboard")


def _ip(request):
    return request.META.get("HTTP_X_REAL_IP") or request.META.get("REMOTE_ADDR", "")


def login_view(request):
    if request.user.is_authenticated:
        return redirect(_next(request))
    if request.GET.get("next"):
        request.session["next"] = request.GET["next"]
    mobile_form, pass_form = MobileForm(prefix="m"), PasswordLoginForm(prefix="p")
    if request.method == "POST":
        if "send_code" in request.POST:
            mobile_form = MobileForm(request.POST, prefix="m")
            if mobile_form.is_valid():
                key = f"otp-ip:{_ip(request)}"
                if cache.get(key, 0) >= 8:
                    messages.error(request, "تعداد درخواست کد زیاد است؛ چند دقیقه بعد دوباره تلاش کنید.")
                else:
                    cache.set(key, cache.get(key, 0) + 1, 600)
                    mobile = mobile_form.cleaned_data["mobile"]
                    otp = OTP.issue(mobile)
                    send_otp(mobile, otp.code)
                    request.session["otp_mobile"] = mobile
                    return redirect("accounts:verify")
        elif "with_password" in request.POST:
            pass_form = PasswordLoginForm(request.POST, prefix="p")
            if pass_form.is_valid():
                user = authenticate(request, username=pass_form.cleaned_data["ident"], password=pass_form.cleaned_data["password"])
                if user:
                    login(request, user)
                    return redirect(_next(request))
                pass_form.add_error(None, "اطلاعات ورود درست نیست.")
    return render(request, "accounts/login.html", {"mobile_form": mobile_form, "pass_form": pass_form})


def verify_view(request):
    mobile = request.session.get("otp_mobile")
    if not mobile:
        return redirect("accounts:login")
    form = OTPForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        if OTP.verify(mobile, form.cleaned_data["code"]):
            user, created = User.objects.get_or_create(mobile=mobile)
            if not user.mobile_verified:
                user.mobile_verified = True
                user.save(update_fields=["mobile_verified"])
            login(request, user)
            request.session.pop("otp_mobile", None)
            if created or not user.first_name:
                messages.success(request, "خوش آمدید! نام خود را وارد کنید تا در فرم‌ها و تیم نمایش داده شود.")
                return redirect("accounts:profile")
            return redirect(_next(request))
        form.add_error("code", "کد نادرست یا منقضی است.")
    return render(request, "accounts/verify.html", {"form": form, "mobile": mobile})


@require_POST
def resend_view(request):
    mobile = request.session.get("otp_mobile")
    if mobile:
        otp = OTP.issue(mobile)
        send_otp(mobile, otp.code)
        messages.info(request, "کد دوباره ارسال شد.")
    return redirect("accounts:verify")


def logout_view(request):
    logout(request)
    return redirect("core:home")


@login_required
def profile(request):
    posted = request.method == "POST" and "save_profile" in request.POST
    form = ProfileForm(request.POST if posted else None, request.FILES if posted else None, instance=request.user)
    pw_form = SetPasswordForm(prefix="pw")
    if request.method == "POST":
        if "save_profile" in request.POST and form.is_valid():
            form.save()
            messages.success(request, "پروفایل ذخیره شد.")
            return redirect(request.session.pop("next", None) or "surveys:dashboard")
        if "save_password" in request.POST:
            pw_form = SetPasswordForm(request.POST, prefix="pw")
            if pw_form.is_valid():
                request.user.set_password(pw_form.cleaned_data["password1"])
                request.user.save()
                login(request, request.user)
                messages.success(request, "رمز عبور تنظیم شد.")
                return redirect("accounts:profile")
    return render(request, "accounts/profile.html", {"form": form, "pw_form": pw_form})
