#!/usr/bin/env bash
# گواهی SSL برای s.icsd.ir و روشن‌کردن تنظیمات امنیتی HTTPS — فقط فایل nginx همین سایت تغییر می‌کند.
#   sudo bash /srv/icsdforms/app/deploy/enable_https.sh
set -euo pipefail
export NEEDRESTART_MODE=l NEEDRESTART_SUSPEND=1 DEBIAN_FRONTEND=noninteractive
DOMAIN="${DOMAIN:-s.icsd.ir}"; APP=/srv/icsdforms/app; VENV=/srv/icsdforms/venv
command -v certbot >/dev/null || apt-get install -y -qq certbot python3-certbot-nginx
certbot --nginx -d "$DOMAIN" --redirect --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring \
  || certbot --nginx -d "$DOMAIN" --redirect
sed -i 's/^HTTPS_ENABLED=.*/HTTPS_ENABLED=True/' $APP/.env
sudo -u icsdforms bash -c "cd $APP && $VENV/bin/python manage.py shell -c \"from apps.core.models import SiteSettings as S; s=S.load(); s.site_url='https://$DOMAIN'; s.save()\""
systemctl restart icsdforms; sleep 2
systemctl is-active icsdforms && echo "✓ https://$DOMAIN فعال شد"
