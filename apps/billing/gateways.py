"""درگاه زرین‌پال (نسخه‌ی ۴ API). مبالغ به تومان گرفته و به ریال ارسال می‌شوند."""
import logging

import requests
from django.conf import settings

log = logging.getLogger(__name__)


class GatewayError(Exception):
    pass


class Zarinpal:
    def __init__(self):
        from apps.core.models import SiteSettings
        s = SiteSettings.load()
        self.merchant = s.zarinpal_merchant_id or settings.ZARINPAL_MERCHANT_ID
        self.sandbox = s.zarinpal_sandbox if s.zarinpal_merchant_id else settings.ZARINPAL_SANDBOX
        base = "https://sandbox.zarinpal.com" if self.sandbox else "https://payment.zarinpal.com"
        self.api, self.start = f"{base}/pg/v4/payment", f"{base}/pg/StartPay/"

    def request(self, amount, callback, description, mobile=""):
        if not self.merchant:
            raise GatewayError("درگاه پرداخت هنوز تنظیم نشده است. با پشتیبانی تماس بگیرید.")
        try:
            r = requests.post(f"{self.api}/request.json", timeout=15, json={
                "merchant_id": self.merchant, "amount": amount * 10, "currency": "IRR", "callback_url": callback,
                "description": description[:250], "metadata": {"mobile": mobile}})
            data = r.json().get("data") or {}
            if data.get("code") == 100:
                return data["authority"]
            raise GatewayError(f"خطای درگاه: {r.json().get('errors') or r.text[:150]}")
        except requests.RequestException as e:
            raise GatewayError(f"اتصال به درگاه برقرار نشد: {e}")

    def pay_url(self, authority):
        return self.start + authority

    def verify(self, amount, authority):
        try:
            r = requests.post(f"{self.api}/verify.json", timeout=15,
                              json={"merchant_id": self.merchant, "amount": amount * 10, "authority": authority})
            data = r.json().get("data") or {}
            if data.get("code") in (100, 101):
                return {"ok": True, "ref_id": str(data.get("ref_id", "")), "card_pan": data.get("card_pan", "")}
            log.warning("verify failed %s", r.text[:300])
        except requests.RequestException as e:
            log.error("verify error %s", e)
        return {"ok": False, "ref_id": "", "card_pan": ""}
