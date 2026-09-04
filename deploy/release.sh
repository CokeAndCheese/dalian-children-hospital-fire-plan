#!/usr/bin/env bash
set -Eeuo pipefail

readonly PROJECT_SLUG="dalian-children-hospital-fire-plan"
readonly PROJECT_DIR="/srv/apps/${PROJECT_SLUG}"
readonly CONTAINER_NAME="${PROJECT_SLUG}"
readonly IMAGE_NAME="${PROJECT_SLUG}:local"
readonly PUBLIC_URL="http://115.159.223.98/${PROJECT_SLUG}/"
readonly CONTENT_MARKER='id="fire-rescue-cockpit"'

expected_commit="${1:-}"
bundle_path="${2:-}"

if [[ ! "$expected_commit" =~ ^[0-9a-f]{40}$ ]]; then
  echo "invalid expected commit" >&2
  exit 64
fi
if [[ ! "$bundle_path" =~ ^/tmp/dalian-children-hospital-fire-plan-[0-9]+-[0-9]+\.bundle$ ]]; then
  echo "invalid bundle path" >&2
  exit 64
fi
if [[ ! -f "$bundle_path" ]]; then
  echo "release bundle not found" >&2
  exit 66
fi

exec 9>"/tmp/${PROJECT_SLUG}.deploy.lock"
if ! flock -n 9; then
  echo "another release is active" >&2
  exit 75
fi

incoming_ref="refs/deploy/incoming-${expected_commit}"
old_commit=""
old_image=""
advanced=0

cleanup() {
  rm -f -- "$bundle_path"
  if [[ -n "$incoming_ref" ]]; then
    git -C "$PROJECT_DIR" update-ref -d "$incoming_ref" 2>/dev/null || true
  fi
}

rollback_on_error() {
  status=$?
  trap - ERR
  set +e
  if [[ "$advanced" -eq 1 && -n "$old_commit" ]]; then
    echo "release failed; restoring ${old_commit}"
    cd "$PROJECT_DIR" || exit "$status"
    git switch --detach "$old_commit"
    git update-ref refs/heads/main "$old_commit" "$expected_commit"
    git switch main
    if ! sudo docker compose up -d --build && [[ -n "$old_image" ]]; then
      sudo docker image tag "$old_image" "$IMAGE_NAME"
      sudo docker compose up -d --force-recreate --no-build
    fi
  fi
  cleanup
  exit "$status"
}

trap cleanup EXIT
trap rollback_on_error ERR

cd "$PROJECT_DIR"
if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "server checkout must be on main" >&2
  exit 65
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "server checkout is not clean" >&2
  exit 65
fi

old_commit="$(git rev-parse HEAD)"
old_image="$(sudo docker image inspect "$IMAGE_NAME" --format '{{.Id}}' 2>/dev/null || true)"
echo "release ${old_commit} -> ${expected_commit}; rollback image ${old_image:-none}"

git bundle verify "$bundle_path"
git fetch --no-tags "$bundle_path" "refs/heads/release-main:${incoming_ref}"
target_commit="$(git rev-parse "$incoming_ref")"
if [[ "$target_commit" != "$expected_commit" ]]; then
  echo "bundle commit does not match workflow commit" >&2
  exit 65
fi
if ! git merge-base --is-ancestor "$old_commit" "$expected_commit"; then
  echo "release is not a strict fast-forward" >&2
  exit 65
fi

git merge --ff-only "$expected_commit"
advanced=1
sudo docker compose config --quiet
sudo docker compose up -d --build

health=""
for _ in $(seq 1 30); do
  health="$(sudo docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CONTAINER_NAME" 2>/dev/null || true)"
  if [[ "$health" == "healthy" ]]; then
    break
  fi
  sleep 2
done
if [[ "$health" != "healthy" ]]; then
  echo "container did not become healthy: ${health:-missing}" >&2
  exit 1
fi

sudo docker exec "$CONTAINER_NAME" wget -qO- http://127.0.0.1/health | grep -Fxq ok
curl --fail --silent --show-error --max-time 20 "$PUBLIC_URL" | grep -Fq "$CONTENT_MARKER"

trap - ERR
cleanup
trap - EXIT
echo "release complete: ${expected_commit}"

