// ============================================================================
// Copy des messages Discord MEMBRES (DM onboarding, salon privé, statut,
// relances) — source unique de vérité.
// ----------------------------------------------------------------------------
// Ces builders renvoient un objet { embed, button? } que les actions de
// transport (onboardings.discordDm / discordPostOnboarding) passent au bot,
// qui rend un EMBED brandé (barre orange #FF5A1F, titre, corps, bouton). Plus
// de texte brut empilé ni de cartes de preview parasites.
//
// Convention : un message = une idée = au plus UN bouton-lien (le CTA). On
// préfère les mentions de salon `<#id>` (cliquables, sans preview) aux URLs
// brutes dans le corps.
// ============================================================================

import type { JourneyStateKind } from "./journey";

export type Tier = "coaching" | "communaute";

export type DiscordEmbed = {
  title?: string;
  description?: string;
  footer?: string;
};
export type DiscordButton = { label: string; url: string };
// `buttons` (tableau) = plusieurs boutons-liens sur une même ligne (ex. Connecter
// + code AMR) ; `button` (singulier) reste pour le cas à un seul CTA.
export type DiscordMessage = {
  embed: DiscordEmbed;
  button?: DiscordButton;
  buttons?: DiscordButton[];
};

/** Heads-up email Discord : un email validé est requis pour relier l'accès.
 *  Réutilisé tel quel dans plusieurs messages pour une formulation unique. */
export const EMAIL_VALIDE_NOTE =
  "Vérifie que l'email de ton compte Discord est validé (Paramètres Discord → Mon compte), sinon on ne pourra pas relier ton accès.";

/** « C'est parti » → « C'est parti, Kevin ». Sans prénom : base inchangée. */
function withName(base: string, firstName: string | null): string {
  const n = (firstName ?? "").trim();
  return n ? `${base}, ${n}` : base;
}

/** Message « lie ton compte » : compte Discord pas (encore) relié à un paiement.
 *  Donne 2 chemins de réparation (OAuth + code AMR) et prévient pour l'email
 *  Discord non validé. Réutilisé à l'arrivée (non lié), au fallback S'onboarder
 *  et dans la relance. */
export function linkAccountDm({
  activateUrl,
}: {
  // URL unique « Activer mon accès » : login → /compte?lier=code. Tout converge
  // vers « login + preuve du paiement » ; /compte gère les 3 cas après connexion.
  activateUrl: string;
}): DiscordMessage {
  return {
    embed: {
      title: `Bienvenue dans AMOUR STUDIOS 🧡`,
      description:
        `Pour débloquer ton accès au Discord, il te reste à **activer ton accès**.\n\n` +
        `⚠️ **À FAIRE EN PREMIER** : vérifie que l'email de ton compte Discord est **validé** ` +
        `(Discord t'envoie un mail de vérification — clique le lien dedans). Sans ça, l'activation ne peut pas marcher.\n\n` +
        `Ensuite, 2 façons de t'activer :\n` +
        `**1.** Clique **« Activer mon accès »** ci-dessous et connecte-toi avec **CE** compte Discord — ` +
        `ça se relie tout seul si ton email correspond, sinon colle ton **code AMR** (reçu par mail).\n` +
        `**2.** Ou ouvre le **lien d'activation reçu dans ton email d'achat**.`,
    },
    buttons: [{ label: "Activer mon accès", url: activateUrl }],
  };
}

// ── 1er envoi du lien d'onboarding (sendLink) ───────────────────────────────
export function linkDm({
  firstName,
  tier,
  link,
}: {
  firstName: string | null;
  tier: Tier;
  link: string;
}): DiscordMessage {
  if (tier === "coaching") {
    return {
      embed: {
        title: `${withName("C'est parti", firstName)} ✨`,
        description:
          `Plus que 3 étapes pour ton accès complet :\n` +
          `• Tes coordonnées (~30 s)\n` +
          `• Questionnaire (~5 min) pour que Walid prépare ton 1er appel\n` +
          `• Réserver ton 1er appel avec Walid`,
        footer: `Tant que le RDV n'est pas réservé, ton accès Discord reste limité.`,
      },
      button: { label: "Commencer mon onboarding", url: link },
    };
  }
  return {
    embed: {
      title: `${withName("C'est parti", firstName)} ✨`,
      description:
        `Plus que 2 étapes pour ton accès complet :\n` +
        `• Tes coordonnées\n` +
        `• 3 questions rapides`,
      footer: `Tant que ce n'est pas complété, ton accès reste limité.`,
    },
    button: { label: "Compléter mon profil", url: link },
  };
}

// ── Boussole de statut (sendStatusDm) ───────────────────────────────────────
// Décide quel DM de statut envoyer À PARTIR DE l'état canonique du cerveau
// (JourneyStateKind, cf. lib/journey.ts). Plus de re-dérivation step/canceled
// ici : juste le RENDU Discord de chaque état (1 état = 1 embed). Le mapping
// reprend à l'identique l'ancienne copy (parité). Renvoie null si l'état ne
// mérite pas de DM (not_authed / no_subscription : couverts ailleurs).
export function statusDm({
  firstName,
  tier,
  state,
  link,
  site,
}: {
  firstName: string | null;
  tier: Tier | null;
  state: JourneyStateKind;
  link: string;
  site: string;
}): DiscordMessage | null {
  switch (state) {
    case "canceled":
      return {
        embed: {
          title: `Ton accès AMOUR STUDIOS a pris fin`,
          description: `Tu peux revenir quand tu veux, en 1 clic.`,
          footer: `Une question ? Réponds à ce DM. 🧡`,
        },
        button: { label: "Réactiver mon accès", url: `${site}/compte` },
      };
    case "awaiting_onboarding":
      return {
        embed: {
          title: `Plus qu'une étape pour ton accès 🔥`,
          description:
            `Clique sur **« ✨ S'onboarder »** dans ton salon privé Discord. ` +
            `Je t'envoie ton lien d'onboarding dans la foulée.`,
        },
      };
    case "onboarding_questionnaire":
      return tier === "coaching"
        ? {
            embed: {
              title: `Tu y es presque ✨`,
              description: `Termine ton **questionnaire** (~5 min) pour que Walid prépare ton 1er appel.`,
            },
            button: { label: "Reprendre mon questionnaire", url: link },
          }
        : {
            embed: {
              title: `Tu y es presque ✨`,
              description: `Complète tes **infos** (~2 min) pour débloquer ton accès complet.`,
            },
            button: { label: "Compléter mon profil", url: link },
          };
    case "onboarding_consents":
      return {
        embed: {
          title: `Questionnaire validé ✅`,
          description: `Dernière étape : valide tes **consentements** puis réserve ton 1er RDV avec Walid.`,
        },
        button: { label: "Continuer", url: link },
      };
    case "onboarding_rdv":
      return {
        embed: {
          title: `Questionnaire validé ✅`,
          description: `Dernière étape pour ton accès complet : réserve ton 1er RDV avec Walid.`,
        },
        button: { label: "Réserver mon 1er RDV", url: link },
      };
    case "active":
      return {
        embed: {
          title: `${withName("Tout est validé", firstName)} 🎉`,
          description: `Tu as accès à tout sur le Discord. À très vite ! 🧡`,
        },
      };
    default:
      return null; // not_authed, no_subscription
  }
}

// ── DM final d'activation (grantOnboarded) ──────────────────────────────────
// `generalRef` = mention de salon `<#id>` (cliquable, sans preview) si dispo,
// sinon « #général » en texte.
export function grantedDm({
  firstName,
  tier,
  base,
  generalRef,
}: {
  firstName: string | null;
  tier: Tier;
  base: string;
  generalRef: string;
}): DiscordMessage {
  const access =
    tier === "coaching"
      ? `Ton accès est complet : tous les channels, ton espace exercices, et ton 1er RDV calé.`
      : `Ton accès est complet : tu as accès à tous les channels de la communauté.`;
  return {
    embed: {
      title: `${withName("C'est validé", firstName)} 🎉`,
      description:
        `${access}\n\n` +
        `Dernière chose : passe sur ${generalRef} te présenter en 2 lignes ` +
        `(qui tu es, ton projet, un de tes sons).`,
      footer: `Ton espace est toujours dispo dans #mon-espace.`,
    },
    // Coaching → /exos (ses exercices) ; Communauté → /compte (pas d'exos, /exos
    // serait un écran verrouillé).
    button: {
      label: "Ouvrir mon espace",
      url: tier === "coaching" ? `${base}/exos` : `${base}/compte`,
    },
  };
}

// ── « Compte lié » posté dans le salon privé (postLinkedStatusToChannel) ────
export function linkedChannelMsg({
  firstName,
  tier,
  step,
  link,
}: {
  firstName: string | null;
  tier: Tier | null;
  step: string | null;
  link: string;
}): DiscordMessage {
  const who = (firstName ?? "").trim();
  const tag = who ? ` ${who}` : "";
  if (step === "rdv_booked" || step === "community_ready") {
    return {
      embed: {
        title: `Compte lié — tout est validé 🎉`,
        description: `Bravo${tag}, ton compte est lié et tu as accès à tout sur le serveur ! 🧡`,
      },
    };
  }
  if ((step === "consents" || step === "form_done") && tier === "coaching") {
    return {
      embed: {
        title: `Compte lié 🎉`,
        description: `Bravo${tag} ! Dernière étape pour ton accès complet : réserve ton 1er RDV avec Walid.`,
      },
      button: { label: "Réserver mon 1er RDV", url: link },
    };
  }
  return {
    embed: {
      title: `Compte lié 🎉`,
      description: `Bravo${tag} ! Dernière étape : complète ton onboarding.`,
    },
    button: {
      label: tier === "coaching" ? "Ouvrir mon onboarding" : "Compléter mon profil",
      url: link,
    },
  };
}

// ── Relances (relanceDiscordContent) ────────────────────────────────────────
export type RelanceScenario = "presentation" | "questionnaire" | "rdv";
export type RelanceLevel = 24 | 48 | 7;

export function relanceDm({
  level,
  scenario,
  tier,
  link,
}: {
  level: RelanceLevel;
  scenario: RelanceScenario;
  tier: Tier;
  firstName: string | null;
  link: string;
}): DiscordMessage {
  if (scenario === "presentation") {
    // Le lien n'est pas encore généré à ce stade → action = bouton S'onboarder
    // dans le salon privé, pas de bouton-lien ici.
    if (level === 24) {
      return {
        embed: {
          title: `Petit rappel 🔥`,
          description:
            `Tu n'as pas encore démarré ton onboarding. ` +
            `Clique sur **« ✨ S'onboarder »** dans ton salon privé Discord et je t'envoie ton lien dans la foulée.`,
        },
      };
    }
    if (level === 48) {
      return {
        embed: {
          title: `Ton onboarding n'est pas démarré`,
          description:
            `Ça fait 2 jours. Un clic sur **« ✨ S'onboarder »** dans ton salon privé et tu reçois ton lien. C'est 30 secondes, vraiment.`,
        },
      };
    }
    return {
      embed: {
        title: `Dernier rappel`,
        description:
          `7 jours sans avoir démarré ton onboarding. Sans action de ta part, on devra fermer ton onboarding et libérer ta place.`,
        footer: `Un blocage ? Réponds à ce DM, on regarde ensemble.`,
      },
    };
  }

  if (scenario === "questionnaire") {
    const why =
      tier === "coaching"
        ? `5 min pour le boucler — c'est ce qui permet à Walid de préparer ton 1er appel.`
        : `2 min pour le finir — dernière étape avant ton accès complet.`;
    if (level === 24) {
      return {
        embed: {
          title: `Petit rappel`,
          description: `Ton questionnaire d'onboarding n'est pas terminé. ${why}`,
        },
        button: { label: "Reprendre mon questionnaire", url: link },
      };
    }
    if (level === 48) {
      const blk =
        tier === "coaching"
          ? `Sans lui, tu ne peux pas réserver ton 1er RDV ni écrire sur le Discord.`
          : `Sans lui, ton accès Discord reste limité.`;
      return {
        embed: {
          title: `Ton questionnaire est en pause`,
          description: `48 h sans nouvelles. ${blk}`,
        },
        button: { label: "Reprendre mon questionnaire", url: link },
      };
    }
    return {
      embed: {
        title: `Dernier rappel`,
        description: `7 jours que ton questionnaire est ouvert. Sans action, on suspend ton onboarding.`,
        footer: `Un blocage ? Dis-le moi en réponse.`,
      },
      button: { label: "Reprendre mon questionnaire", url: link },
    };
  }

  // rdv (coaching only)
  if (level === 24) {
    return {
      embed: {
        title: `Plus que ton 1er RDV 🙌`,
        description:
          `Questionnaire OK. Réserve ton 1er appel avec Walid — c'est ce qui débloque ton accès Discord complet (écriture, lives, feedback).`,
      },
      button: { label: "Réserver mon 1er RDV", url: link },
    };
  }
  if (level === 48) {
    return {
      embed: {
        title: `Ton 1er RDV n'est pas posé`,
        description: `48 h depuis la validation de ton questionnaire. Ton accès Discord reste limité tant que le créneau n'est pas réservé.`,
      },
      button: { label: "Réserver mon 1er RDV", url: link },
    };
  }
  return {
    embed: {
      title: `Dernier rappel`,
      description: `7 jours sans RDV. Ton accès Discord reste limité.`,
      footer: `Pas de créneau qui te va ? Réponds-moi, on cale ça à la main.`,
    },
    button: { label: "Réserver mon 1er RDV", url: link },
  };
}

// ── Fin de coaching : win-back vers la Communauté (Stripe webhook) ───────────
export function coachingEndedDm({ commuUrl }: { commuUrl: string }): DiscordMessage {
  return {
    embed: {
      title: `Ton coaching est terminé 🙏`,
      description:
        `Merci pour ces 3 mois ! Pour garder le Discord, les ressources et le groupe, ` +
        `tu peux continuer dans la **Communauté (79€/mois)**.`,
    },
    button: { label: "Rejoindre la Communauté", url: commuUrl },
  };
}

// ── Fin de coaching imminente : win-back J-7 / J-1 (cron lifecycle) ──────────
export function coachingEndingDm({
  daysLeft,
  commuUrl,
}: {
  daysLeft: number;
  commuUrl: string;
}): DiscordMessage {
  const title =
    daysLeft <= 1
      ? `Dernier jour de ton coaching ⏳`
      : `Ton coaching se termine dans ${daysLeft} jours`;
  return {
    embed: {
      title,
      description:
        `Pour rester dans la boucle, tu peux continuer dans la **Communauté (79€/mois)** : ` +
        `Discord, ressources et groupe.`,
    },
    button: { label: "Rejoindre la Communauté", url: commuUrl },
  };
}

// ── Remboursement total : accès coupé (Stripe webhook) ──────────────────────
export function refundDm({
  amountEur,
  cur,
}: {
  amountEur: string;
  cur: string;
}): DiscordMessage {
  return {
    embed: {
      title: `Remboursement effectué`,
      description: `On vient d'effectuer un remboursement de **${amountEur} ${cur}** sur ton compte. Ton accès Discord a été retiré.`,
      footer: `Une erreur, ou tu veux reprendre ? Écris-nous : contact@amourstudios.fr`,
    },
  };
}

// ── Paiement échoué : carte à mettre à jour (Stripe webhook) ────────────────
export function paymentFailedDm({ site }: { site: string }): DiscordMessage {
  return {
    embed: {
      title: `Ta carte bancaire a échoué`,
      description:
        `Pas de panique : Stripe va réessayer automatiquement plusieurs fois. ` +
        `Le mieux reste de mettre à jour ta carte depuis ton compte.`,
      footer: `Besoin d'aide ? contact@amourstudios.fr`,
    },
    button: { label: "Mettre à jour ma carte", url: `${site}/compte` },
  };
}
