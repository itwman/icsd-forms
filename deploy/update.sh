#!/usr/bin/env bash
# به‌روزرسانی بعد از هر push به گیت‌هاب — فقط سرویس icsdforms ری‌استارت می‌شود.
#   sudo bash /srv/icsdforms/app/deploy/update.sh
set -euo pipefail
APP=/srv/icsdforms/app; VENV=/srv/icsdforms/venv; PIP_INDEX="${PIP_INDEX_URL:-https://mirror-pypi.runflare.com/simple}"
M() { sudo -u icsdforms bash -c "cd $APP && $VENV/bin/python manage.py $*"; }
sudo -u icsdforms git -C $APP pull --ff-only
sudo -u icsdforms $VENV/bin/pip install -q -r $APP/requirements.txt -i "$PIP_INDEX" || sudo -u icsdforms $VENV/bin/pip install -q -r $APP/requirements.txt
M migrate --noinput
M collectstatic --noinput -v0
M seed_forms
systemctl restart icsdforms
sleep 2; systemctl is-active icsdforms && echo "✓ به‌روز شد"
