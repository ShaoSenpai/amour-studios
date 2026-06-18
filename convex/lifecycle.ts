import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

// ============================================================================
// Amour Studios — Crons « cycle de vie » des achats.
//  - remindUnactivatedPurchases : payé mais jamais lié à un compte (lead perdu).
//  - remindRenewals : coaching 3 mois proche de la fin → proposer un renouvellement.
// ============================================================================

const DAY = 24 * 60 * 60 * 1000;

// ── #3 : paiements non activés ──────────────────────────────────────────────

/** Purchases payés (active/paid) jamais liés à un user, dans la fenêtre
 *  [48h, 14j] depuis l'achat, dont la relance date de > 3j (ou jamais). */
export const listUnactivatedPurchases = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const minAge = now - 2 * DAY; // au moins 48h (grâce : le claim arrive souvent vite)
    const maxAge = now - 14 * DAY; // au-delà de 14j on abandonne la relance auto
    const reminderStale = now - 3 * DAY;

    const out: Doc<"purchases">[] = [];
    for (const status of ["active", "paid"] as const) {
      const rows = await ctx.db
        .query("purchases")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      for (const p of rows) {
        if (p.userId) continue; // déjà lié à un compte
        if (p.createdAt > minAge) continue; // trop récent
        if (p.createdAt < maxAge) continue; // trop vieux
        if (p.activationReminderAt && p.activationReminderAt > reminderStale) continue;
        if (!p.email) continue;
        out.push(p);
      }
    }
    return out;
  },
});

export const markActivationReminder = internalMutation({
  args: { purchaseId: v.id("purchases") },
  handler: async (ctx, { purchaseId }) => {
    await ctx.db.patch(purchaseId, { activationReminderAt: Date.now() });
  },
});

/** Cron quotidien : relance les paiements non activés (re-email claim + alerte
 *  Walid). Sans ça, un élève qui paye 179€ mais ne crée jamais son compte est
 *  invisible et jamais relancé (la table onboardings n'existe qu'après login). */
export const remindUnactivatedPurchases = internalAction({
  args: {},
  handler: async (ctx) => {
    const purchases = await ctx.runQuery(
      internal.lifecycle.listUnactivatedPurchases,
      {}
    );
    let reminded = 0;
    for (const p of purchases) {
      // Marque AVANT l'envoi (idempotence : pas de double relance si crash).
      await ctx.runMutation(internal.lifecycle.markActivationReminder, {
        purchaseId: p._id,
      });
      try {
        // Token claim frais (le 1er a pu expirer avant la création du compte).
        const pi = p.stripePaymentIntentId;
        if (pi && pi.startsWith("pi_")) {
          const token = await ctx.runMutation(
            internal.claimTokens.refreshForPaymentIntent,
            { paymentIntentId: pi, email: p.email }
          );
          await ctx.runAction(internal.emails.sendClaimEmail, {
            to: p.email,
            firstName: "",
            claimToken: token,
            tier: p.tier,
          });
        }
      } catch (err) {
        console.warn("⚠️ relance activation email échec:", err);
      }
      // Alerte Walid pour rattrapage manuel (high-touch).
      await ctx
        .runAction(internal.discord.postAlertToStaff, {
          content:
            `🟠 **Paiement non activé** — ${p.email}\n` +
            `${p.tier ?? "?"}${p.duree ? ` ${p.duree}` : ""} payé il y a ${Math.floor(
              (Date.now() - p.createdAt) / DAY
            )}j mais aucun compte créé.\n` +
            `→ Email de réactivation renvoyé. Pense à le contacter si ça traîne.`,
        })
        .catch(() => {});
      await ctx
        .runMutation(internal.events.recordEventByEmail, {
          email: p.email,
          type: "purchase.activation_reminder",
          title: "Relance paiement non activé",
          actor: "system",
        })
        .catch(() => {});
      reminded++;
    }
    console.log(`🟠 remindUnactivatedPurchases: ${reminded} relances`);
    return { reminded };
  },
});

// ── #12 : fin de coaching 3 mois → win-back Communauté (J-7 / J-1) ───────────
// Le coaching 3 mois facture mensuellement mais se termine à ~90j (cancel_at posé
// à la création). On NE se base donc PAS sur currentPeriodEnd (= cycle mensuel,
// qui ferait relancer avant chaque prélèvement) mais sur la VRAIE date de fin =
// createdAt + 90j. À J-7 et J-1 on propose d'atterrir dans la Communauté 79€.
// Le palier J:0 (accès fermé) est géré par le webhook customer.subscription.deleted.

const COMMU_URL = "https://amourstudios.fr/paiement/?offre=communaute";
const COACHING_DAYS = 90;

/** Vraie date de fin d'un coaching 3 mois (cancel_at ≈ createdAt + 90j). */
function coachingEndsAt(p: Doc<"purchases">): number {
  return p.createdAt + COACHING_DAYS * DAY;
}

/** Coaching 3 mois actifs dont la fin réelle approche (≤ 7j), avec le palier dû
 *  (J-7 ou J-1) pas encore envoyé. Renvoie {purchase, level, daysLeft}. */
export const listRenewalsDue = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("purchases")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const due: { purchase: Doc<"purchases">; level: 7 | 1; daysLeft: number }[] = [];
    for (const p of rows) {
      if (p.tier !== "coaching" || p.duree !== "3mois") continue;
      const endsAt = coachingEndsAt(p);
      if (endsAt <= now) continue; // déjà fini → géré par le webhook (J:0)
      const daysLeft = Math.max(1, Math.ceil((endsAt - now) / DAY));
      if (daysLeft <= 1 && !p.renewalReminderJ1At) {
        due.push({ purchase: p, level: 1, daysLeft: 1 });
      } else if (daysLeft <= 7 && !p.renewalReminderJ7At) {
        due.push({ purchase: p, level: 7, daysLeft });
      }
    }
    return due;
  },
});

export const markRenewalReminder = internalMutation({
  args: { purchaseId: v.id("purchases"), level: v.union(v.literal(7), v.literal(1)) },
  handler: async (ctx, { purchaseId, level }) => {
    await ctx.db.patch(
      purchaseId,
      level === 1
        ? { renewalReminderJ1At: Date.now() }
        : { renewalReminderJ7At: Date.now() }
    );
  },
});

/** Cron quotidien : séquence win-back J-7 / J-1 avant la fin d'un coaching 3 mois.
 *  Évite la coupure sèche sans préavis et propose d'atterrir en Communauté 79€.
 *  Email premium + DM Discord à l'élève + alerte Walid. Idempotent par palier. */
export const remindRenewals = internalAction({
  args: {},
  handler: async (ctx) => {
    const due = await ctx.runQuery(internal.lifecycle.listRenewalsDue, {});
    let reminded = 0;
    for (const { purchase: p, level, daysLeft } of due) {
      await ctx.runMutation(internal.lifecycle.markRenewalReminder, {
        purchaseId: p._id,
        level,
      });

      const user = await ctx.runQuery(internal.stripe.findUserByEmail, {
        email: p.email,
      });
      const firstName = user?.name?.split(" ")[0] ?? null;

      // Email premium win-back.
      await ctx
        .runAction(internal.emails.sendRenewalWinback, {
          to: p.email,
          firstName,
          level,
          daysLeft,
        })
        .catch(() => {});

      // DM Discord (si lié).
      if (user?.discordId) {
        const dm =
          level === 1
            ? `Salut 👋\n\n**Dernier jour de ton coaching** ⏳\n` +
              `Avant que ton accès se ferme, garde ta place avec nous dans la **Communauté (79€/mois)** : Discord + ressources + groupe.\n👉 ${COMMU_URL}`
            : `Salut 👋\n\nTon **coaching 3 mois se termine dans ${daysLeft} jour${daysLeft > 1 ? "s" : ""}**.\n` +
              `Pour rester dans la boucle, tu peux continuer dans la **Communauté (79€/mois)** : Discord + ressources + groupe.\n👉 ${COMMU_URL}`;
        await ctx
          .runAction(internal.onboardings.discordDm, {
            discordId: user.discordId,
            content: dm,
          })
          .catch(() => {});
      }

      // Alerte Walid (suivi perso).
      await ctx
        .runAction(internal.discord.postAlertToStaff, {
          content:
            `📅 **Fin de coaching (J-${level})** — ${p.email}\n` +
            `Win-back Communauté 79€ envoyé. → un mot perso peut aider à le convertir.`,
        })
        .catch(() => {});

      await ctx
        .runMutation(internal.events.recordEventByEmail, {
          email: p.email,
          type: "subscription.renewal_reminder",
          title: `Win-back fin de coaching (J-${level})`,
          actor: "system",
        })
        .catch(() => {});
      reminded++;
    }
    console.log(`📅 remindRenewals: ${reminded} relances win-back`);
    return { reminded };
  },
});
