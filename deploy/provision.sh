#!/usr/bin/env bash
set -euo pipefail
revision=${1:?Expected tested revision}
[[ $revision =~ ^[a-f0-9]{40}$ ]] || exit 2
deploy_root=/opt/ems-language-dev
release=$deploy_root/releases/$revision
[[ -f $release/deploy/ems-language-dev.service && -f /etc/nginx/ems-language-dev.htpasswd ]] || exit 3
for owned in /etc/nginx/sites-available/ems-language-dev /etc/systemd/system/ems-language-dev.service; do
  if [[ -e $owned ]]; then head -1 "$owned" | grep -qx '# Managed by EMS language deployment' || { echo 'Refusing to replace an unowned configuration'; exit 4; }; fi
done
if ! id ems-language-dev >/dev/null 2>&1; then useradd --system --no-create-home --shell /usr/sbin/nologin ems-language-dev; fi
install -d -m 0755 /var/www/ems-language-dev-acme
if [[ ! -f /etc/letsencrypt/live/ems-language-dev/fullchain.pem ]]; then
  install -m 0644 "$release/deploy/nginx-acme.conf" /etc/nginx/sites-available/ems-language-dev
  ln -sfn /etc/nginx/sites-available/ems-language-dev /etc/nginx/sites-enabled/ems-language-dev
  nginx -t
  systemctl reload nginx
  certbot certonly --webroot -w /var/www/ems-language-dev-acme --cert-name ems-language-dev -d dev-ems.d-mash.ru --non-interactive --agree-tos --register-unsafely-without-email --deploy-hook 'systemctl reload nginx'
fi
install -m 0644 "$release/deploy/ems-language-dev.service" /etc/systemd/system/ems-language-dev.service
install -m 0644 "$release/deploy/nginx.conf" /etc/nginx/sites-available/ems-language-dev
ln -sfn /etc/nginx/sites-available/ems-language-dev /etc/nginx/sites-enabled/ems-language-dev
nginx -t
if [[ -L $deploy_root/current && $(readlink "$deploy_root/current") != "$release" ]]; then readlink "$deploy_root/current" > "$deploy_root/previous"; fi
ln -sfn "$release" "$deploy_root/next"
mv -Tf "$deploy_root/next" "$deploy_root/current"
systemctl daemon-reload
systemctl enable ems-language-dev.service
if ! systemctl restart ems-language-dev.service; then
  bash "$release/deploy/rollback.sh"
  exit 5
fi
ready=false
for attempt in {1..20}; do if curl --fail --silent --output /dev/null http://127.0.0.1:18877/; then ready=true; break; fi; sleep 0.2; done
if [[ $ready != true ]]; then bash "$release/deploy/rollback.sh"; exit 6; fi
systemctl reload nginx
systemctl is-active ems-language-dev.service
openssl x509 -in /etc/letsencrypt/live/ems-language-dev/fullchain.pem -noout -dates -ext subjectAltName
