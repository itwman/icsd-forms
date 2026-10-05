"""پیامک: کنسول در توسعه، کاوه‌نگار روی سرور (کلید در «تنظیمات سامانه» یا .env)."""
import logging
import threading

import requests
from django.conf import settings

log = logging.getLogger(__name__)


def _cfg():
    from apps.core.models import SiteSettings
    try:
        s = SiteSettings.load()
        return s.kavenegar_api_key or settings.KAVENEGAR_API_KEY, s
    except Exception:
        return settings.KAVENEGAR_API_KEY, None


def lookup(mobile, template, token, token2="", token3="", background=False):
    key, s = _cfg()
    if settings.SMS_PROVIDER != "kavenegar" or not key:
        print(f"\n[SMS → {mobile}] ({template}) {token} {token2} {token3}\n")
        log.warning("SMS console %s %s %s", mobile, template, token)
        return True

    def _send():
        try:
            params = {"receptor": mobile, "token": str(token).replace(" ", "‌")[:100], "template": template}
            if token2:
                params["token2"] = str(token2).replace(" ", "‌")[:100]
            if token3:
                params["token3"] = str(token3).replace(" ", "‌")[:100]
            r = requests.get(f"https://api.kavenegar.com/v1/{key}/verify/lookup.json", params=params, timeout=10)
            if r.status_code != 200:
                log.error("Kavenegar %s", r.text[:300])
            return r.status_code == 200
        except requests.RequestException as e:
            log.error("Kavenegar failed: %s", e)
            return False

    if background:
        threading.Thread(target=_send, daemon=True).start()
        return True
    return _send()


def send_otp(mobile, code):
    _, s = _cfg()
    return lookup(mobile, (s.kavenegar_otp_template if s else "otp"), code)
