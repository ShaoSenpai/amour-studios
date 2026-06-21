# AMOUR STUDIOS — Contexte projet & outil interne (source de vérité)

_Maj : 2026-06-19_

> ⚠️ Les sections 5-7 ci-dessous datent du 2026-06-09. **L'état réel à jour vit dans la mémoire** (`.claude/projects/.../memory/MEMORY.md`, chargée à chaque session). Depuis : tout l'onboarding E2E + Calendly + Fireflies + Google Meet live ; back-office /studio mobile ; landing réécrite + allégée mobile ; **liaison paiement↔compte refondue** (primitif fiable + code AMR-XXXXXX, voir [[liaison-paiement-compte]]) ; questionnaire onboarding en wizard ; flow Discord piloté par bouton (présente-toi retiré). **Reste go-live : Stripe TEST→LIVE, mode test à false + retirer resetTestFunnel, Backups Convex, Portail Stripe, 2FA modo Discord.**

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
| Site marketing | `SITE/AMOURstudios_SITE` → OVH → **amourstudios.fr** | Landing + `/paiement` + `/merci`. DA Swiss. **Live**. |
| Backend + app | `SKOOL/amour-studios` (Next.js 16 + Convex) | Auth Discord, Stripe, Resend, Mux, `/studio` (back-office), `/exos`, `/onboarding`, `/claim`. Convex dev=`flexible-lobster-990`, prod=`frugal-curlew-831`. **Live** sur amour-studios.vercel.app. |
| Bot Discord | `SKOOL/amour-discord-bot` | Rôles par palier + listener #🎤・présente-toi + DM/grant-onboarded. **Live** sur amour-discord-bot.fly.dev (Fly.io cdg). |
| Bot WhatsApp | `1_DOCS/projet/BOT_BACKEND` | Tâches Notion équipe — séparé. **Live**. |
| Stripe | API + dashboard | **TEST mode configuré** (compte Kevin créé 06/09). Prix 79€/179€ + webhook → Convex. À basculer en live quand prêt à vendre. |
| Calendly | À configurer | Event « 1er RDV » créé par Walid. Webhook à connecter (`CALENDLY_WEBHOOK_SIGNING_KEY`). |
| Outils | — | Stripe, Calendly, Resend, Notion, Fireflies, Mux, Higgsfield. |

Accès admin (dev) : `ADMIN_DISCORD_IDS` (CSV d'IDs Discord) → promotion auto au login. `SITE_URL` (dev) doit pointer vers le localhost utilisé pour que le login marche en local.

## 5. État du code (live en prod)
- **Phase 1 — Paiement Stripe** : prix créés (Communauté `price_1TgXRaEPVgDbT6ZuTpUYkYsw`, Coaching `price_1TgXRbEPVgDbT6ZucHZ5WJPz`), webhook configuré, env Convex set. **E2E validé en test** (sub created → record purchases active; cancel → status canceled).
- **Phase 2 — Back-office /studio** : dashboard « Aujourd'hui » Glass C, fiche élève, calendrier RDV jour/semaine/mois, blocs paiement/Discord/onboarding/activité. **Live**.
- **Phase 3 — /exos** : catalogue élève coaching avec gating tier+avancée. 9 exos externes visibles (filtrés sur `exerciseUrl`). **Live**.
- **Phase 4 — Bot Discord custom** : 3 rôles gérés (Membre/Coaching/Onboardé). Listener #🎤・présente-toi avec animation 👋 + reply public. Endpoints sync-roles, dm, grant-onboarded. **Live sur Fly**.
- **Phase 5 — Flow onboarding E2E** : paiement → présentation obligatoire → DM Discord + email avec lien `/onboarding/[token]` → questionnaire → grant Onboardé. **Validé E2E 2026-06-09**.

## 6. Architecture de l'outil interne (validée)
Navigation : sidebar gauche (repliable) + barre du bas mobile.
- **🎯 Aujourd'hui** (accueil/zéro réflexion) : RDV du jour/semaine, élèves à relancer (coaching sans RDV), alertes paiement (`past_due`/annulés), onboarding en attente, activité récente, compteurs (coaching actifs · communauté · MRR).
- **👤 Élèves + Fiche élève** : liste filtrable (palier/statut/étape) + recherche pseudo Discord → fiche (identité Discord · étape · prochain RDV + historique notes/résumés · paiement · Discord · notes).
- **📅 Calendrier** : agenda RDV (jour/semaine) + RDV manuel + statuts (fait/no-show/annulé), Calendly branché.
- **💳 Paiements** : abonnements/revenus (actifs, `past_due`, annulés, MRR, échéances), lien Stripe.
- _Plus tard_ : **📣 Relances/CRM** (segments + campagnes Resend), **💬 Communauté** (Discord/annonces), **⚙️ Réglages**, réactivation plateforme vidéo.

**Périmètre v1** : Aujourd'hui · Élèves + Fiche · Calendrier · Paiements.

## 7. Roadmap restante (au 2026-06-09)

### Court terme (en cours)
- **Phase B onboarding** : permissions channels Discord (matrice vue/écriture par rôle dans `SPEC_ONBOARDING_FLOW.md`)
- **Phase C onboarding** : cron relances (DM + email + alerte Walid à 24h/48h/7j)
- **Phase D onboarding** : upsell 79€→179€ en fin de questionnaire
- **Phase E onboarding** : bloc /studio « Onboardings en attente »
- **Phase F onboarding** : fix bug webhook Stripe (auto-attribution rôle pas fiable)
- **Calendly** : intégration URL + webhook subscription

### Moyen terme
- Stripe live (basculer en mode live quand prêt à vendre)
- Témoignages + CTA final site marketing
- Brique C SAV : Stripe customer portal (change plan, refund)
- Tour de contrôle : briques B (CRM), D (Fireflies), E (campagnes)

### Long terme
- Réactivation plateforme vidéo
