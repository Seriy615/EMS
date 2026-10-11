#!/usr/bin/env bash
set -euo pipefail
deploy_root=/opt/ems-language-dev
[[ -f $deploy_root/previous ]] || { echo 'No previous EMS language release'; exit 2; }
previous=$(cat "$deploy_root/previous")
[[ $previous =~ ^/opt/ems-language-dev/releases/[a-f0-9]{40}$ && -f $previous/tools/serve.mjs ]] || exit 3
ln -sfn "$previous" "$deploy_root/rollback-next"
mv -Tf "$deploy_root/rollback-next" "$deploy_root/current"
systemctl restart ems-language-dev.service
curl --retry 10 --retry-connrefused --retry-delay 1 --fail --silent --output /dev/null http://127.0.0.1:18877/
echo 'Previous EMS language release restored'
