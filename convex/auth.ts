import Discord from "@auth/core/providers/discord";
import { convexAuth } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

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
      // Scope : identify + email + guilds (guilds requis pour le gate membership)
      authorization: { params: { scope: "identify email guilds" } },
      // Mapping du profil Discord vers les champs Convex Auth.
      // Le 2e arg contient les tokens OAuth — on s'en sert pour vérifier
      // que le user est bien dans notre serveur Discord avant d'autoriser.
      async profile(discordProfile, tokens) {
        const requiredGuildId = process.env.DISCORD_GUILD_ID;
        if (requiredGuildId) {
          const res = await fetch("https://discord.com/api/users/@me/guilds", {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          if (!res.ok) {
            throw new Error("DISCORD_GUILDS_FETCH_FAILED");
          }
          const guilds = (await res.json()) as Array<{ id: string }>;
          const isMember = guilds.some((g) => g.id === requiredGuildId);
          if (!isMember) {
            // Bloque le signIn — user non-membre du serveur Amour Studios
            throw new Error("NOT_IN_DISCORD_SERVER");
          }
        }
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

      if (existingUserId !== null) {
        // User existant → on met à jour les infos publiques + lastActiveAt
        await ctx.db.patch(existingUserId, {
          name,
          email,
          image,
          discordId,
          discordUsername,
          lastActiveAt: now,
        });
        return existingUserId;
      }

      // Création d'un nouveau user — on initialise tous les champs métier
      // Puis on cherche un purchase existant avec le même email
      let purchaseId;
      if (email) {
        const purchase = await ctx.db
          .query("purchases")
          .filter((q) => q.eq(q.field("email"), email))
          .first();
        if (purchase && purchase.status === "paid") {
          purchaseId = purchase._id;
        }
      }

      const userId = await ctx.db.insert("users", {
        name,
        email,
        image,
        discordId,
        discordUsername,
        role: "member",
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

      return userId;
    },
  },
});
