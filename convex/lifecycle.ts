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

// ── #12 : renouvellement coaching 3 mois (J-7) ──────────────────────────────

/** Coaching 3 mois actifs dont la période se termine dans ≤ 8 jours, pas encore
 *  relancés (ou relance > 30j). */
export const listRenewalsDue = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const horizon = now + 8 * DAY;
    const reminderStale = now - 30 * DAY;
    const rows = await ctx.db
      .query("purchases")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    return rows.filter(
      (p) =>
        p.tier === "coaching" &&
        p.duree === "3mois" &&
        typeof p.currentPeriodEnd === "number" &&
        p.currentPeriodEnd > now &&
        p.currentPeriodEnd <= horizon &&
        (!p.renewalReminderAt || p.renewalReminderAt < reminderStale)
    );
  },
});

export const markRenewalReminder = internalMutation({
  args: { purchaseId: v.id("purchases") },
  handler: async (ctx, { purchaseId }) => {
    await ctx.db.patch(purchaseId, { renewalReminderAt: Date.now() });
  },
});

/** Cron quotidien : relance renouvellement J-7 avant la fin d'un coaching 3 mois.
 *  Évite la coupure sèche (Discord + exos) le jour J sans préavis. DM l'élève +
 *  alerte Walid (qui fait le suivi personnalisé). */
export const remindRenewals = internalAction({
  args: {},
  handler: async (ctx) => {
    const due = await ctx.runQuery(internal.lifecycle.listRenewalsDue, {});
    let reminded = 0;
    for (const p of due) {
      await ctx.runMutation(internal.lifecycle.markRenewalReminder, {
        purchaseId: p._id,
      });
      const days = Math.max(
        1,
        Math.ceil(((p.currentPeriodEnd ?? Date.now()) - Date.now()) / DAY)
      );
      // DM l'élève s'il a lié son Discord.
      const user = await ctx.runQuery(internal.stripe.findUserByEmail, {
        email: p.email,
      });
      if (user?.discordId) {
        await ctx
          .runAction(internal.onboardings.discordDm, {
            discordId: user.discordId,
            content:
              `Salut 👋\n\nTon **coaching 3 mois touche à sa fin dans ${days} jour${days > 1 ? "s" : ""}**.\n\n` +
              `Pour continuer (accès Discord + exos + suivi), on peut reconduire ensemble. ` +
              `Réponds à ce DM ou écris-nous : contact@amourstudios.fr 🔥`,
          })
          .catch(() => {});
      }
      await ctx
        .runAction(internal.discord.postAlertToStaff, {
          content:
            `📅 **Renouvellement à proposer** — ${p.email}\n` +
            `Coaching 3 mois se termine dans ${days}j. → Contacte-le pour reconduire.`,
        })
        .catch(() => {});
      await ctx
        .runMutation(internal.events.recordEventByEmail, {
          email: p.email,
          type: "subscription.renewal_reminder",
          title: `Relance renouvellement (J-${days})`,
          actor: "system",
        })
        .catch(() => {});
      reminded++;
    }
    console.log(`📅 remindRenewals: ${reminded} relances`);
    return { reminded };
  },
});
