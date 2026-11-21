#!/usr/bin/env bash
# U7 guard: the old sign-in pages and the "Submit an idea" nav tab stay removed.
# One sign-in page (/sign-in) serves everyone; old paths only redirect to it.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
problem() { echo "U7 guard: $1" >&2; fail=1; }

# 1. Removed pages must not come back.
for file in \
  innovation_portal_public/src/pages/Login.tsx \
  innovation_portal_public/src/pages/SignUp.tsx \
  innovation_portal_public/src/pages/ForgotPassword.tsx \
  innovation_portal_public/src/pages/ResetPassword.tsx \
  innovation_portal_public/src/pages/MfaChallenge.tsx \
  innovation_portal_public/src/pages/innovator/CodeSignIn.tsx \
  innovation_portal_public/src/components/auth/StaffSignInButton.tsx; do
  [ -e "$file" ] && problem "$file was removed in U7 (use /sign-in)."
done
for name in Login SignIn LogIn SignUp ForgotPassword ResetPassword MfaChallenge TwoStep StaffLogin; do
  found=$(find innovation_portal_admin/src/pages -iname "${name}.jsx" 2>/dev/null | head -1)
  [ -n "$found" ] && problem "$found: the staff console has no sign-in, reset or two-step page (U7)."
done

# 2. Old paths may only redirect: no route element other than the redirect for them.
if grep -nE "path=\"/(login|signup|forgot-password|reset-password|mfa)\"" innovation_portal_public/src/App.tsx; then
  problem "innovation_portal_public/src/App.tsx renders an old sign-in path; it must only redirect (OLD_SIGN_IN_PATHS)."
fi

# 3. No "Submit an idea" tab in the main navigation (the button on the right stays).
if [ -f innovation_portal_public/src/lib/nav.ts ] && grep -n "nav.submit" innovation_portal_public/src/lib/nav.ts; then
  problem "innovation_portal_public/src/lib/nav.ts lists Submit an idea as a nav link (U7 section 3)."
fi

[ "$fail" -eq 0 ] && echo "U7 guard: removed pages stay removed."
exit "$fail"
