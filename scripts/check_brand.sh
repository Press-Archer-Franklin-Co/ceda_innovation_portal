#!/usr/bin/env bash
# Brand guard (U12). Fails when:
#   - CEDA is typed as text in a component instead of drawn from the official logo files
#     (">CEDA<" in either app's src, outside tests and i18n);
#   - an index.html lacks the favicon.svg or favicon.ico link;
#   - the old footer.tagline string is still used (the full logo carries the tagline).
# Usage: bash scripts/check_brand.sh
set -u
cd "$(git rev-parse --show-toplevel)"
fail=0

# Code only: the official logo files (src/assets/brand/*.svg) carry <title>CEDA</title> on purpose.
typed=$(git grep -n ">CEDA<" -- 'innovation_portal_admin/src/*.js' 'innovation_portal_admin/src/*.jsx' \
  'innovation_portal_public/src/*.ts' 'innovation_portal_public/src/*.tsx' 'innovation_portal_admin/src/*.css' \
  'innovation_portal_public/src/*.css' ':!*.test.*' ':!**/i18n/**' || true)
if [ -n "$typed" ]; then
  echo "CEDA typed as text. Use Logo, BrandLockup or CedaWord (the official drawing):"
  echo "$typed"
  fail=1
fi

for html in innovation_portal_admin/index.html innovation_portal_public/index.html; do
  for icon in favicon.svg favicon.ico; do
    if ! grep -Eq "<link[^>]+rel=\"icon\"[^>]+href=\"[^\"]*${icon}\"" "$html"; then
      echo "$html: no <link rel=\"icon\"> for ${icon}"
      fail=1
    fi
  done
done

tagline=$(git grep -n "footer.tagline" -- innovation_portal_admin/src innovation_portal_public/src || true)
if [ -n "$tagline" ]; then
  echo "footer.tagline is still used. The full CEDA logo (BrandLockup) carries the tagline:"
  echo "$tagline"
  fail=1
fi

if [ "$fail" -eq 0 ]; then echo "Brand guard: no problems."; fi
exit "$fail"
