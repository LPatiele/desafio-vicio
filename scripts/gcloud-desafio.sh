#!/bin/sh
# Install local to the workspace; credentials remain in gcloud's standard
# user directory, never in the project or its experiment snapshots.
set -eu
task_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
task_python=/Users/lorrainepatiele/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3
if [ ! -x "$task_python" ]; then
  printf '%s\n' 'Python 3.10+ necessário. Ajuste task_python em scripts/gcloud-desafio.sh.' >&2
  exit 1
fi
export CLOUDSDK_PYTHON="$task_python"
exec "$task_root/.tools/google-cloud-sdk/bin/gcloud" "$@"
