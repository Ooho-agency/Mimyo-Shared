#!/usr/bin/env bash
# Assemble the staging site in dist/: one folder per review-v* tag (/v1/, /v2/, ...), the comment layer
# injected into every page copy, versions.json for the picker, and / opening the newest version.
# STAGING_DRAFT=1 also adds the working tree as /draft/ (local testing only).
set -euo pipefail

root=$(git rev-parse --show-toplevel)
out=${1:-$root/dist}
cd "$root"

rm -rf "$out"
mkdir -p "$out/_review"
cp staging/review/* "$out/_review/"
cp staging/staticwebapp.config.json "$out/"

skip=(--exclude=experiments --exclude=staging --exclude=.claude --exclude=.github --exclude=CLAUDE.md --exclude=CHANGES.md --exclude=README.md --exclude=.gitignore)

inject() {
  for f in "$1"/*.html; do
    perl -0pi -e 's#</body>#<script src="/_review/comments.js" defer></script>\n</body>#' "$f"
  done
}

rows=()
for tag in $(git tag -l 'review-v*' --sort=v:refname); do
  v=${tag#review-}
  # Versions listed in staging/hidden-versions keep their tag but are no longer served.
  if grep -qx "$v" staging/hidden-versions 2>/dev/null; then continue; fi
  mkdir -p "$out/$v"
  git archive "$tag" | tar -x -C "$out/$v" "${skip[@]}"
  inject "$out/$v"
  rows+=("$v"$'\t'"$(git tag -l --format='%(contents:subject)' "$tag")"$'\t'"$(git tag -l --format='%(creatordate:short)' "$tag")")
done

if [ "${STAGING_DRAFT:-}" = 1 ]; then
  mkdir -p "$out/draft"
  git ls-files -co --exclude-standard | grep -v -e '^experiments/' -e '^staging/' -e '^\.' -e '^CLAUDE.md$' -e '^CHANGES.md$' -e '^README.md$' \
    | tar -c -T - | tar -x -C "$out/draft"
  inject "$out/draft"
  rows+=("draft"$'\t'"Working copy"$'\t'"$(date +%F)")
fi

printf '%s\n' "${rows[@]+"${rows[@]}"}" | node -e '
  const rows = require("fs").readFileSync(0, "utf8").split("\n").filter(Boolean).map(l => l.split("\t"));
  // Version name: V<number>_<tag date>, e.g. V2_20261102. The tag message is kept as a note.
  const versions = rows.map(([id, label, date]) => ({ id, name: id === "draft" ? "Draft" : `V${id.slice(1)}_${date.replace(/-/g, "")}`, label, date }));
  require("fs").writeFileSync(process.argv[1] + "/versions.json", JSON.stringify(versions, null, 2));
  const latest = versions.filter(v => v.id !== "draft").pop() || versions.pop();
  require("fs").writeFileSync(process.argv[1] + "/index.html", latest
    ? `<!doctype html><meta charset="utf-8"><title>Mimyo staging</title><meta http-equiv="refresh" content="0;url=/${latest.id}/"><a href="/${latest.id}/">Open ${latest.name}</a>`
    : `<!doctype html><meta charset="utf-8"><title>Mimyo staging</title><p>No review version yet. Tag one: git tag -a review-v1 -m "First review"</p>`);
  console.log("versions:", versions.map(v => v.name).join(", ") || "none");
' "$out"
