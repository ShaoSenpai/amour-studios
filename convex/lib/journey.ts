// ============================================================================
// journey.ts — Résolveur PUR « où en est le client + quoi faire ».
// ----------------------------------------------------------------------------
// FONCTION PURE (aucun accès DB) → testable en isolation (vitest), même pattern
// que lib/supportState.ts. NON branchée sur les surfaces live (Phase 0 : on
// construit la fondation read-only SANS toucher au flow onboarding existant).
//
// But (cf. 1_DOCS/projet/AUDIT_PARCOURS_CLIENT.md) : unifier en UN SEUL endroit
// la lecture des 4 états bruts (paiement Stripe × liaison × étape onboarding ×
// rôle) → un état canonique { où je suis, quoi faire, pourquoi bloqué, comment
// réparer }. Vocation : remplacer à terme les dérivations éparses
// (subscriptions.mySubscription, exercises.accessSummary, onboardings.myCurrent,
// gate Discord, relances) — UNE migration surface par surface, plus tard.
//
// Phase 0 = CE fichier (pur) + journey.test.ts + une query fine non consommée.
// Rien ici n'est branché → impossible de casser l'onboarding live.
// ============================================================================

export type Tier = "communaute" | "coaching";

export type OnboardingStep =
  | "awaiting_presentation"
  | "link_sent"
  | "consents"
  | "form_done"
  | "rdv_booked"
  | "community_ready";

export type PurchaseStatus =
  | "pending"
  | "paid"
  | "refunded"
  | "failed"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

// État canonique du parcours (l'enum que toutes les surfaces consommeront).
export type JourneyStateKind =
  | "not_authed" // pas connecté
  | "no_subscription" // connecté, aucun abonnement actif lié
  | "canceled" // abonnement résilié / engagement terminé
  | "awaiting_onboarding" // lié + actif, onboarding pas démarré
  | "onboarding_questionnaire" // questionnaire à remplir (link_sent)
  | "onboarding_consents" // coaching : consentements RGPD à valider
  | "onboarding_rdv" // coaching : 1er RDV à réserver
  | "active"; // onboardé + actif → accès complet

export type Remedy = { label: string; href: string };

export type JourneyInput = {
  authed: boolean;
  isAdmin: boolean;
  // Purchase le plus pertinent du user, déjà résolu par l'appelant (query
  // wrapper) : l'abonnement actif s'il existe, sinon le plus récent canceled ;
  // null si aucun. `duree` sert au coaching (1mois/3mois).
  purchase: {
    status: PurchaseStatus;
    tier: Tier | null;
    duree?: "1mois" | "3mois" | null;
  } | null;
  // Row onboarding du user (étape courante) ; null si pas encore créée.
  onboarding: { step: OnboardingStep; tier: Tier | null } | null;
  // Token d'onboarding (deep-link wizard SANS session — clé du parcours webview).
  onboardingToken: string | null;
};

export type JourneyState = {
  state: JourneyStateKind;
  tier: Tier | null;
  blocked: boolean; // l'accès complet est-il bloqué ?
  paymentLate: boolean; // past_due : accès gardé MAIS carte à mettre à jour
  reason: string | null; // POURQUOI (lisible) — null si rien à expliquer
  remedy: Remedy[]; // COMMENT débloquer / agir
  title: string;
  body: string;
  primaryCta: Remedy | null;
};

// Statuts qui donnent accès (aligné avec lib/access.ts isActiveStatus).
const ACTIVE_STATUSES: PurchaseStatus[] = ["active", "paid", "past_due"];
function isActive(s: PurchaseStatus): boolean {
  return ACTIVE_STATUSES.includes(s);
}

// Deep-link onboarding : on privilégie le lien token (marche sans session, donc
// en webview) ; fallback /onboarding/welcome si le token n'est pas connu.
function onboardingLink(token: string | null): string {
  return token ? `/onboarding/${token}` : "/onboarding/welcome";
}

function make(
  state: JourneyStateKind,
  tier: Tier | null,
  partial: Partial<Omit<JourneyState, "state" | "tier">>
): JourneyState {
  return {
    state,
    tier,
    blocked: partial.blocked ?? false,
    paymentLate: partial.paymentLate ?? false,
    reason: partial.reason ?? null,
    remedy: partial.remedy ?? [],
    title: partial.title ?? "",
    body: partial.body ?? "",
    primaryCta: partial.primaryCta ?? null,
  };
}

// Overlay paiement en retard (past_due) : accès CONSERVÉ mais on signale la
// carte à mettre à jour (bandeau côté surface). Ne change pas `blocked` ni
// l'état du parcours — c'est une alerte transverse.
function withPaymentLate(s: JourneyState, late: boolean): JourneyState {
  if (!late) return s;
  return {
    ...s,
    paymentLate: true,
    reason:
      "Ton dernier paiement n'est pas passé — ton accès reste actif pour l'instant, mets à jour ta carte." +
      (s.reason ? ` (${s.reason})` : ""),
    remedy: [
      { label: "Mettre à jour ma carte", href: "/compte" },
      ...s.remedy,
    ],
  };
}

/**
 * Calcule l'état canonique du parcours à partir des 4 états bruts. PURE.
 * Ordre d'évaluation : auth → admin → pas d'abo / canceled → onboarding en
 * cours → actif. Le past_due est un overlay (accès gardé + alerte carte).
 */
export function computeNextStep(input: JourneyInput): JourneyState {
  const { authed, isAdmin, purchase, onboarding, onboardingToken } = input;

  // 0) Non authentifié.
  if (!authed) {
    return make("not_authed", null, {
      blocked: true,
      reason: "Tu n'es pas connecté.",
      title: "Connexion requise",
      body: "Connecte-toi avec ton compte Discord pour accéder à ton espace.",
      remedy: [{ label: "Se connecter avec Discord", href: "/login" }],
      primaryCta: { label: "Se connecter", href: "/login" },
    });
  }

  // Admin : accès total, hors parcours client.
  if (isAdmin) {
    return make("active", null, {
      blocked: false,
      title: "Espace admin",
      body: "Accès complet (admin).",
      primaryCta: { label: "Aller au studio", href: "/studio" },
    });
  }

  // 1) Pas d'abonnement actif.
  if (!purchase || !isActive(purchase.status)) {
    // Résilié → état dédié avec chemin de retour (pas un cul-de-sac).
    if (purchase && purchase.status === "canceled") {
      const wasCoaching = purchase.tier === "coaching";
      return make("canceled", purchase.tier, {
        blocked: true,
        reason: wasCoaching
          ? "Ton coaching (engagement 3 mois) est arrivé à terme."
          : "Ton abonnement a été résilié.",
        title: "Ton accès a pris fin",
        body: "Tu peux reprendre quand tu veux, en 1 clic.",
        remedy: [
          {
            label: wasCoaching
              ? "Reprendre le coaching ou passer en Communauté"
              : "Réactiver mon accès",
            href: "/compte",
          },
        ],
        primaryCta: { label: "Voir mes options", href: "/compte" },
      });
    }
    // Aucun abonnement actif du tout (jamais payé, ou payé non lié).
    return make("no_subscription", null, {
      blocked: true,
      reason: "Aucun abonnement actif n'est lié à ton compte.",
      title: "Aucun abonnement actif",
      body: "Tu as déjà payé ? Lie ton paiement. Sinon, découvre les offres.",
      remedy: [
        { label: "Lier mon paiement", href: "/compte?lier=code" },
        { label: "Découvrir les offres", href: "https://amourstudios.fr" },
      ],
      primaryCta: { label: "Mon compte", href: "/compte" },
    });
  }

  // ── À partir d'ici : purchase ACTIF (active / paid / past_due) ────────────
  const tier = purchase.tier;
  const paymentLate = purchase.status === "past_due";
  const link = onboardingLink(onboardingToken);
  const step: OnboardingStep = onboarding?.step ?? "awaiting_presentation";
  const onboardingComplete =
    step === "rdv_booked" || step === "community_ready";

  // 2) Onboarding pas terminé → étape courante (toujours un CTA, jamais de dead-end).
  if (!onboardingComplete) {
    if (step === "awaiting_presentation") {
      return withPaymentLate(
        make("awaiting_onboarding", tier, {
          blocked: true,
          reason: "Ton onboarding n'est pas démarré.",
          title: "Plus qu'une étape 🔥",
          body: "Démarre ton onboarding pour débloquer ton accès complet.",
          remedy: [{ label: "Démarrer mon onboarding", href: link }],
          primaryCta: { label: "Démarrer mon onboarding", href: link },
        }),
        paymentLate
      );
    }
    if (step === "link_sent") {
      return withPaymentLate(
        make("onboarding_questionnaire", tier, {
          blocked: true,
          reason: "Ton questionnaire n'est pas terminé.",
          title: "Tu y es presque ✨",
          body:
            tier === "coaching"
              ? "Termine ton questionnaire (~5 min) pour passer à la suite."
              : "Complète tes infos (~2 min) pour finaliser ton accès.",
          remedy: [{ label: "Reprendre mon questionnaire", href: link }],
          primaryCta: { label: "Reprendre", href: link },
        }),
        paymentLate
      );
    }
    if (step === "consents") {
      return withPaymentLate(
        make("onboarding_consents", tier, {
          blocked: true,
          reason: "Il reste à valider les consentements.",
          title: "Questionnaire validé ✅",
          body: "Valide les consentements pour réserver ton 1er RDV.",
          remedy: [{ label: "Continuer", href: link }],
          primaryCta: { label: "Continuer", href: link },
        }),
        paymentLate
      );
    }
    // step === "form_done" : coaching → RDV à réserver (la communauté ne reste
    // pas ici : community_ready est son terminal).
    return withPaymentLate(
      make("onboarding_rdv", tier, {
        blocked: true,
        reason: "Ton 1er RDV n'est pas encore réservé.",
        title: "Dernière étape : ton 1er RDV 🙌",
        body: "Réserve ton 1er appel — c'est ce qui débloque ton accès complet.",
        remedy: [{ label: "Réserver mon RDV", href: link }],
        primaryCta: { label: "Réserver mon RDV", href: link },
      }),
      paymentLate
    );
  }

  // 3) Onboardé + actif → accès complet.
  const dest = tier === "coaching" ? "/exos" : "/compte";
  return withPaymentLate(
    make("active", tier, {
      blocked: false,
      title: "Ton accès est actif 🧡",
      body:
        tier === "coaching"
          ? "Tu as accès à tes exercices et à la communauté."
          : "Tu as accès à la communauté.",
      primaryCta: {
        label: tier === "coaching" ? "Mes exercices" : "Mon compte",
        href: dest,
      },
    }),
    paymentLate
  );
}
