# فرم‌ساز ICSD — s.icsd.ir

سامانه‌ی ساخت فرم و پرسشنامه (مشابه پرس‌لاین) با ثبت‌نام عمومی، پلن و پرداخت زرین‌پال، کار تیمی، منطق شرطی، محاسبه و امتیاز، گزارش و خروجی اکسل.
پروژه و سرویس کاملاً جدا از icsd.ir است (کاربر، پوشه، دیتابیس، سرویس و فایل nginx جدا).

## نصب روی سرور (یک‌بار)
```
cd /tmp
git clone https://github.com/itwman/icsd-forms.git icsd-forms-setup
sudo DB_PASS=رمز‌انگلیسی‌۱۲کاراکتری bash icsd-forms-setup/deploy/install.sh
sudo -u icsdforms bash -c 'cd /srv/icsdforms/app && /srv/icsdforms/venv/bin/python manage.py createsuperuser'
sudo bash /srv/icsdforms/app/deploy/enable_https.sh
```

## به‌روزرسانی بعد از هر push
```
sudo bash /srv/icsdforms/app/deploy/update.sh
```

## تنظیمات بعد از نصب (از /panel/ ← تنظیمات سامانه)
- کلید API کاوه‌نگار و نام الگوهای پیامک (otp، newresponse، invite) — تا آن موقع کد ورود فقط در لاگ سرور است: `journalctl -u icsdforms -f`
- مرچنت زرین‌پال (و خاموش‌کردن حالت آزمایشی)

## بخش‌ها
- `/` صفحه‌ی اصلی، `/pricing/`، `/templates/` — `/app/` پیشخوان کاربر — `/f/<کد>/` فرم عمومی — `/panel/` مدیریت کل سامانه
- قالب‌های آماده با `python manage.py seed_forms` ساخته می‌شوند (`--overwrite` برای بازنویسی).
