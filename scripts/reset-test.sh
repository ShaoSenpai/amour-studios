#!/usr/bin/env bash
# ============================================================================
# reset-test.sh — slate vierge pour un test E2E (Convex + Stripe TEST).
#
# Fait, en une commande :
#   1. récupère la clé Stripe depuis Convex prod ;
#   2. REFUSE si ce n'est pas une clé TEST (sk_test_…) → jamais le live ;
#   3. supprime tous les customers Stripe (annule leurs subscriptions) ;
#   4. lance le reset Convex (admin:_resetAllTest) — vide le funnel + supprime
#      les comptes de test (NON-admin), préserve les admins.
#
# 🔒 Double garde-fou go-live :
#   - Stripe : refus si sk_live.
#   - Convex : la mutation _resetAllTest refuse si ALLOW_TEST_RESET ≠ "true".
#     AVANT le passage en LIVE : `npx convex env remove ALLOW_TEST_RESET --prod`.
#
# Usage : depuis amour-studios/ →  bash scripts/reset-test.sh
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ Récupération de la clé Stripe (Convex prod)…"
SK="$(npx convex env get STRIPE_SECRET_KEY --prod 2>/dev/null | tr -d '[:space:]')"

case "$SK" in
  sk_test_*) echo "✅ Clé Stripe TEST — OK" ;;
  sk_live_*) echo "❌ STOP : clé Stripe LIVE détectée. Reset annulé."; exit 1 ;;
  *)         echo "❌ STOP : clé Stripe introuvable/inattendue. Reset annulé."; exit 1 ;;
esac

echo "→ Suppression des customers Stripe (test)…"
for round in 1 2 3 4 5; do
  ids="$(curl -s "https://api.stripe.com/v1/customers?limit=100" -u "$SK:" \
        | python3 -c "import sys,json;[print(c['id']) for c in json.load(sys.stdin).get('data',[])]")"
  [ -z "$ids" ] && break
  echo "$ids" | while read -r id; do
    [ -n "$id" ] && curl -s -X DELETE "https://api.stripe.com/v1/customers/$id" -u "$SK:" >/dev/null
  done
done
left="$(curl -s "https://api.stripe.com/v1/customers?limit=100" -u "$SK:" \
       | python3 -c "import sys,json;print(len(json.load(sys.stdin).get('data',[])))")"
echo "   customers restants : $left"

echo "→ Reset Convex (funnel + comptes de test)…"
npx convex run admin:_resetAllTest '{}' --prod

echo "✅ Slate vierge. (Stripe : subscriptions canceled restent en historique — non supprimables via API.)"
