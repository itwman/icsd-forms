from django import forms
from django.contrib.auth import get_user_model

from apps.common.fa import to_en, valid_mobile

User = get_user_model()


class MobileForm(forms.Form):
    mobile = forms.CharField(label="شماره موبایل", max_length=11, widget=forms.TextInput(attrs={
        "class": "form-control form-control-lg", "inputmode": "numeric", "placeholder": "۰۹۱۲۳۴۵۶۷۸۹", "dir": "ltr",
        "autofocus": True, "autocomplete": "tel"}))

    def clean_mobile(self):
        m = to_en(self.cleaned_data["mobile"]).strip()
        if not valid_mobile(m):
            raise forms.ValidationError("شماره موبایل معتبر نیست.")
        return m


class OTPForm(forms.Form):
    code = forms.CharField(label="کد پیامک‌شده", max_length=6, min_length=6, widget=forms.TextInput(attrs={
        "class": "form-control form-control-lg text-center otp-input", "inputmode": "numeric", "dir": "ltr",
        "autocomplete": "one-time-code", "autofocus": True}))

    def clean_code(self):
        return to_en(self.cleaned_data["code"]).strip()


class PasswordLoginForm(forms.Form):
    ident = forms.CharField(label="موبایل یا ایمیل", widget=forms.TextInput(attrs={"class": "form-control", "dir": "ltr"}))
    password = forms.CharField(label="رمز عبور", widget=forms.PasswordInput(attrs={"class": "form-control", "dir": "ltr"}))


class ProfileForm(forms.ModelForm):
    class Meta:
        model = User
        fields = ["first_name", "last_name", "email", "company", "job_title", "avatar"]
        widgets = {
            "first_name": forms.TextInput(attrs={"class": "form-control"}),
            "last_name": forms.TextInput(attrs={"class": "form-control"}),
            "email": forms.EmailInput(attrs={"class": "form-control", "dir": "ltr"}),
            "company": forms.TextInput(attrs={"class": "form-control"}),
            "job_title": forms.TextInput(attrs={"class": "form-control"}),
            "avatar": forms.ClearableFileInput(attrs={"class": "form-control"}),
        }


class SetPasswordForm(forms.Form):
    password1 = forms.CharField(label="رمز جدید", min_length=6, widget=forms.PasswordInput(attrs={"class": "form-control", "dir": "ltr"}))
    password2 = forms.CharField(label="تکرار رمز", widget=forms.PasswordInput(attrs={"class": "form-control", "dir": "ltr"}))

    def clean(self):
        d = super().clean()
        if d.get("password1") != d.get("password2"):
            raise forms.ValidationError("دو رمز یکسان نیستند.")
        return d
