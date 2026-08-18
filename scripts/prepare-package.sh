#!/usr/bin/env bash

set -euo pipefail

profile="${1:-dev}"

if [[ "$profile" != "release" && "$profile" != "dev" && "$profile" != "debug" ]]; then
  printf 'usage: %s [release|dev|debug]\n' "$0" >&2
  exit 1
fi

template_file="package.template.json"
profile_file="profiles/package.${profile}.json"
output_file="package.json"

if [[ ! -f "$template_file" ]]; then
  printf 'missing template: %s\n' "$template_file" >&2
  exit 1
fi

if [[ ! -f "$profile_file" ]]; then
  printf 'missing profile: %s\n' "$profile_file" >&2
  exit 1
fi

npx --yes mustache "$profile_file" "$template_file" > "$output_file"
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

pkg.telemetry = {
  enabled: false,
  endpoint: '',
};

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

printf 'prepared %s using %s\n' "$output_file" "$profile_file"
