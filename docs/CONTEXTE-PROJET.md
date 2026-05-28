# AMOUR STUDIOS — Contexte projet & outil interne (source de vérité)

_Maj : 2026-05-26_

## 1. Business
Accompagnement pour **artistes musique** : percer via le **contenu sur les réseaux**. Mentor public **Papi Amour** (interne : Walid). Équipe : Kevin, Younes, Shao, Florent (bot).

## 2. Produit (abonnements récurrents)
- **Communauté Discord — 79€/mois** (résiliable).
- **Coaching — 179€/mois** (inclut la communauté) : **1 mois** (résiliable) ou **3 mois** engagement (537€, fin auto à 90j, renouvelable).
- Lifecycle : upsell 79→179, downgrade 179→79, résiliation, fin d'engagement.

## 3. Décisions structurantes
- **Discord = QG** des élèves ; **plateforme vidéo/formation maison en pause** (réactivée plus tard).
- **Approche B** : tout sur l'**infra Convex existante**, pas de SaaS tiers. Une seule source de vérité.
- **Rôles Discord par palier** : `Membre` (79) / `Coaching` (= Membre + Coaching).
- **Étapes coaching** : Onboarding → Positionnement → Contenu → Feedback & Analyse → Terminé.
- **RDV** : Calendly (réservation) + saisie manuelle, dans un calendrier coach.
- **Outil interne = « SaaS privé »** (back-office pour le coach), pas un produit à vendre.

## 4. Infra (où vit quoi)
| Brique | Emplacement | Rôle / état |
|---|---|---|
| Site marketing | `SITE/AMOURstudios_SITE` → OVH → **amourstudios.fr** | Landing + `/paiement` (Stripe Elements) + `/merci`. DA Swiss. |
| Backend + app | `SKOOL/amour-studios` (Next.js 16 + Convex) | Auth Discord, Stripe, Resend, Mux, plateforme élève (pause), **`/admin`**, `/claim`. Convex dev=`flexible-lobster-990`, prod=`frugal-curlew-831`. |
| Bot Discord | `SKOOL/amour-discord-bot` | Rôles par palier (`/sync-roles`, `/remove-role`). À déployer (Fly.io). |
| Bot WhatsApp | `00_PROJET_.../BOT_BACKEND` | Tâches Notion équipe — séparé. |
| Outils | — | Stripe, Calendly, Resend, Notion, Fireflies, Mux, Higgsfield. |

Accès admin (dev) : `ADMIN_DISCORD_IDS` (CSV d'IDs Discord) → promotion auto au login. `SITE_URL` (dev) doit pointer vers le localhost utilisé pour que le login marche en local.

## 5. État du code (sur le dev `flexible-lobster-990`, pas en prod)
- **Phase 1 — Paiement** : `createSubscription` (79/179, 1/3 mois, cancel_at), webhooks lifecycle, rôles Discord auto, capture téléphone, page paiement adaptée. _Reste : prix Stripe + déploiement prod._
- **Phase 2 — Back-office** : table `coachingSessions`, fiche élève `/admin/members/[id]`, calendrier `/admin/calendar` + RDV manuel, webhook Calendly. _Design à refaire ("pas fou")._

## 6. Architecture de l'outil interne (validée)
Navigation : sidebar gauche (repliable) + barre du bas mobile.
- **🎯 Aujourd'hui** (accueil/zéro réflexion) : RDV du jour/semaine, élèves à relancer (coaching sans RDV), alertes paiement (`past_due`/annulés), onboarding en attente, activité récente, compteurs (coaching actifs · communauté · MRR).
- **👤 Élèves + Fiche élève** : liste filtrable (palier/statut/étape) + recherche pseudo Discord → fiche (identité Discord · étape · prochain RDV + historique notes/résumés · paiement · Discord · notes).
- **📅 Calendrier** : agenda RDV (jour/semaine) + RDV manuel + statuts (fait/no-show/annulé), Calendly branché.
- **💳 Paiements** : abonnements/revenus (actifs, `past_due`, annulés, MRR, échéances), lien Stripe.
- _Plus tard_ : **📣 Relances/CRM** (segments + campagnes Resend), **💬 Communauté** (Discord/annonces), **⚙️ Réglages**, réactivation plateforme vidéo.

**Périmètre v1** : Aujourd'hui · Élèves + Fiche · Calendrier · Paiements.

## 7. Roadmap
1. Paiement → accès Discord (codé, à mettre en prod)
2. Back-office coach v1 (4 écrans ci-dessus) + **refonte design**
3. CRM marketing (capture contacts, segmentation, campagnes Resend)
4. Fireflies (résumés de call auto) + réactivation plateforme vidéo

## 8. En attente (actions Kevin, hors code)
- Stripe : créer 2 prix récurrents (79/179) + webhook → déployer Phase 1 en prod.
- Calendly : connecter (webhook + `CALENDLY_WEBHOOK_SIGNING_KEY`).
- Déployer le bot Discord (Fly.io) + sécuriser `BOT_SECRET`.
