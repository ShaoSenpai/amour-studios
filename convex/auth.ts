import Discord from "@auth/core/providers/discord";
import { convexAuth } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { logEvent } from "./lib/events";

// ============================================================================
// Amour Studios — Convex Auth config
// ----------------------------------------------------------------------------
// Discord OAuth est le seul provider autorisé pour la Phase 2.
// Les env vars DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET sont auto-lues par
// @auth/core via process.env (mapping AUTH_DISCORD_ID / AUTH_DISCORD_SECRET).
//
// Le callback `createOrUpdateUser` est appelé à chaque signIn OAuth : on y
// remplit les champs métier (role, xp, streakDays, discordId, timestamps)
// qui n'existent pas dans le profil OAuth brut.
// ============================================================================

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      // Scope : identify + email + guilds. La scope `guilds` est inoffensive
      // (on ne s'en sert plus pour gater l'auth) — on la garde pour ne pas
      // modifier l'écran de consentement Discord déjà validé par les membres.
      authorization: { params: { scope: "identify email guilds" } },
      // Mapping du profil Discord vers les champs Convex Auth.
      //
      // ⚠️ ON NE GATE PLUS l'auth sur l'appartenance au serveur Discord.
      // Avant, `profile()` throwait `NOT_IN_DISCORD_SERVER` si l'user n'était
      // pas déjà dans la guild : un NOUVEAU client qui se connectait AVANT de
      // rejoindre le serveur voyait son OAuth échouer silencieusement → aucun
      // compte Convex créé, paiement jamais lié, aucun rôle → le bot restait
      // muet à sa présentation. Le guard cassait donc l'acquisition.
      // L'accès reste correctement gaté par l'ACHAT (purchase) et le RÔLE
      // Discord (attribué au paiement, au /claim, et à l'arrivée du membre via
      // le listener guildMemberAdd → /webhooks/discord/member-joined), pas par
      // l'appartenance au serveur au moment du login.
      async profile(discordProfile) {
        return {
          id: discordProfile.id,
          name: discordProfile.global_name ?? discordProfile.username,
          email: discordProfile.email,
          image: discordProfile.avatar
            ? `https://cdn.discordapp.com/avatars/${discordProfile.id}/${discordProfile.avatar}.png`
            : undefined,
          // Champs custom qu'on récupère dans createOrUpdateUser via `profile`
          discordId: discordProfile.id,
          discordUsername: discordProfile.username,
        };
      },
    }),
  ],
  callbacks: {
    async createOrUpdateUser(ctx, { existingUserId, profile }) {
      const now = Date.now();
      // Champs tirés du profil Discord (voir `profile()` ci-dessus)
      const discordId = profile.discordId as string | undefined;
      const discordUsername = profile.discordUsername as string | undefined;
      const name = profile.name as string | undefined;
      const email = profile.email as string | undefined;
      const image = profile.image as string | undefined;

      // Auto-promotion admin si le Discord ID est dans ADMIN_DISCORD_IDS (CSV)
      const adminIds = (process.env.ADMIN_DISCORD_IDS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const shouldBeAdmin = !!discordId && adminIds.includes(discordId);

      if (existingUserId !== null) {
        await ctx.db.patch(existingUserId, {
          name,
          email,
          image,
          discordId,
          discordUsername,
          lastActiveAt: now,
          ...(shouldBeAdmin ? { role: "admin" as const } : {}),
        });
        // Si l'user a un purchase actif et pas encore d'onboarding → créer.
        await ctx.scheduler.runAfter(0, internal.onboardings.ensureForUser, {
          userId: existingUserId,
        });
        return existingUserId;
      }

      // Création d'un nouveau user — on initialise tous les champs métier.
      // Puis on cherche un purchase existant avec le même email (normalisé).
      // IMPORTANT : on accepte les statuts d'ABONNEMENT (active/past_due) en
      // plus du legacy "paid" — sinon un payeur coaching était classé « lead
      // non payé » et restait sans accès. On lie en priorité un coaching actif.
      let purchaseId;
      const normEmail = email?.trim().toLowerCase();
      if (normEmail) {
        // .filter (pas .withIndex) : le ctx du callback Convex Auth n'expose
        // pas les index de notre schema. Volume purchases faible → OK.
        const candidates = await ctx.db
          .query("purchases")
          .filter((q) => q.eq(q.field("email"), normEmail))
          .collect();
        const linkable = candidates.filter(
          (p) =>
            p.status === "active" ||
            p.status === "past_due" ||
            p.status === "paid"
        );
        const chosen = linkable.find((p) => p.tier === "coaching") ?? linkable[0];
        if (chosen) purchaseId = chosen._id;
      }

      const userId = await ctx.db.insert("users", {
        name,
        email,
        image,
        discordId,
        discordUsername,
        role: shouldBeAdmin ? "admin" : "member",
        purchaseId,
        xp: 0,
        streakDays: 0,
        lastActiveAt: now,
        createdAt: now,
      });

      // Si on a lié un purchase, mettre à jour le purchase.userId aussi
      if (purchaseId) {
        await ctx.db.patch(purchaseId, { userId });

        // Assigner le rôle Discord VIP si le user a un discordId
        // `email` est garanti truthy ici — on n'atteint ce bloc que via
        // `if (email)` plus haut qui est le seul chemin qui set `purchaseId`.
        if (discordId && email) {
          await ctx.scheduler.runAfter(0, internal.stripe.assignDiscordRole, {
            discordId,
            email,
          });
        }
      }

      // Au cas où le user vient de payer (subscription "active") avec le même
      // email → on crée la row d'onboarding (no-op si rien à faire).
      await ctx.scheduler.runAfter(0, internal.onboardings.ensureForUser, {
        userId,
      });

      // Trace + feed Discord : nouveau membre (titre sans le nom — postFeedToStaff
      // l'ajoute depuis userId, sinon il serait dupliqué).
      await logEvent(ctx, {
        userId,
        type: "member.new",
        title: "Nouveau membre",
        actor: "system",
      });

      return userId;
    },
  },
});
