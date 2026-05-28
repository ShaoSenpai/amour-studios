import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// ============================================================================
// Amour Studios — Convex Schema
// ----------------------------------------------------------------------------
// Voir prd.md section 4 pour la documentation complète de chaque table.
// Timestamps en ms epoch. Soft deletes via deletedAt.
//
// Convex Auth tables (authSessions, authAccounts, authRefreshTokens,
// authVerificationCodes, authVerifiers, authRateLimits) sont injectées via
// `...authTables`. La table `users` est redéfinie ci-dessous pour contenir
// à la fois les champs requis par Convex Auth ET nos champs métier.
// ============================================================================

export default defineSchema({
  ...authTables,

  // `users` override — Convex Auth impose: name, email, image optionnels +
  // index sur email/phone. On ajoute nos champs métier en optionnel pour que
  // la création initiale via OAuth ne casse pas, puis on les remplit dans
  // le callback `createOrUpdateUser` de convex/auth.ts.
  users: defineTable({
    // --- Champs Convex Auth ------------------------------------------------
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    customImage: v.optional(v.id("_storage")),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),

    // --- Champs métier Amour Studios --------------------------------------
    discordId: v.optional(v.string()),
    discordUsername: v.optional(v.string()),
    role: v.optional(v.union(v.literal("admin"), v.literal("member"))),
    onboardingCompletedAt: v.optional(v.number()),
    // Étape du parcours coaching (suivi back-office coach).
    coachingStage: v.optional(
      v.union(
        v.literal("onboarding"),
        v.literal("positionnement"),
        v.literal("contenu"),
        v.literal("feedback_analyse"),
        v.literal("termine")
      )
    ),
    purchaseId: v.optional(v.id("purchases")),
    xp: v.optional(v.number()),
    streakDays: v.optional(v.number()),
    lastActiveAt: v.optional(v.number()),
    createdAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),

    // IDs d'announcements masquées par le user (via bouton "dismiss")
    dismissedAnnouncements: v.optional(v.array(v.id("announcements"))),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_discord", ["discordId"])
    .index("by_role", ["role"]),

  purchases: defineTable({
    email: v.string(),
    stripeSessionId: v.string(),
    stripePaymentIntentId: v.string(),
    stripeCustomerId: v.optional(v.string()),
    amount: v.number(),
    currency: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("refunded"),
      v.literal("failed"),
      // --- Abonnements (lifecycle Stripe) ---------------------------------
      v.literal("active"),       // abonnement en cours
      v.literal("past_due"),     // impayé (relance Phase 3)
      v.literal("canceled"),     // résilié / engagement 3 mois terminé
      v.literal("incomplete")    // PaymentIntent initial pas encore confirmé
    ),
    userId: v.optional(v.id("users")),
    createdAt: v.number(),
    paidAt: v.optional(v.number()),

    // --- Abonnement Stripe (tier, palier, lifecycle) ----------------------
    // tier : palier d'accès → pilote les rôles Discord.
    tier: v.optional(v.union(v.literal("communaute"), v.literal("coaching"))),
    // duree : pour le coaching seulement ("1mois" récurrent / "3mois" engagé).
    duree: v.optional(v.union(v.literal("1mois"), v.literal("3mois"))),
    stripeSubscriptionId: v.optional(v.string()),
    stripePriceId: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),    // fin de la période payée
    cancelAtPeriodEnd: v.optional(v.boolean()),
    phone: v.optional(v.string()),               // capturé au checkout

    // Audit trail — traçabilité des accès offerts vs payés
    source: v.optional(
      v.union(v.literal("stripe"), v.literal("gift"), v.literal("manual"))
    ),
    grantedByUserId: v.optional(v.id("users")), // admin qui a offert
    grantReason: v.optional(v.string()),
    expiresAt: v.optional(v.number()),           // accès temporaire
    revokedAt: v.optional(v.number()),
    revokedReason: v.optional(v.string()),
  })
    .index("by_email", ["email"])
    .index("by_stripe_session", ["stripeSessionId"])
    .index("by_payment_intent", ["stripePaymentIntentId"])
    .index("by_subscription", ["stripeSubscriptionId"])
    .index("by_status", ["status"]),

  // Rate limit buckets : key = "endpoint:ip", window glissante 60s.
  rateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    windowStart: v.number(),
  }).index("by_key", ["key"]),

  // Claim tokens — clés secrètes uniques qui prouvent la propriété d'un paiement.
  // Générées au createPaymentIntent, envoyées au return_url + email, valides 7j,
  // à usage unique. Sécurise le flux /claim contre le hijack de PI ID.
  claimTokens: defineTable({
    token: v.string(),
    paymentIntentId: v.string(),
    email: v.optional(v.string()),
    expiresAt: v.number(),
    claimedAt: v.optional(v.number()),
    claimedByUserId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_payment_intent", ["paymentIntentId"]),

  // Journal d'événements / trace CRM — « qui a fait quoi, quand » par profil.
  // type = identifiant machine (ex. "rdv.completed") ; title = libellé FR ;
  // meta = JSON stringifié (détails) ; actor = coach|system|stripe|calendly…
  events: defineTable({
    userId: v.optional(v.id("users")),
    type: v.string(),
    title: v.string(),
    meta: v.optional(v.string()),
    actor: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_at", ["at"]),

  // Curriculum coaching (tracklist modules → leçons) — dédié, indépendant de la
  // plateforme vidéo (modules/lessons). À plat : 1 ligne = 1 leçon.
  curriculum: defineTable({
    moduleNo: v.number(),
    moduleTitle: v.string(),
    lessonNo: v.number(),
    lessonTitle: v.string(),
    order: v.number(),
  }).index("by_order", ["order"]),

  // Notes libres CRM par élève (hors leçon, hors onboarding) — timeline coach.
  coachingNotes: defineTable({
    userId: v.id("users"),
    coachId: v.optional(v.id("users")),
    content: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Sessions de coaching (RDV) — onboarding + calls hebdo. Source Calendly ou
  // saisie manuelle. Pilote la fiche élève + le calendrier coach.
  coachingSessions: defineTable({
    userId: v.id("users"),
    coachId: v.optional(v.id("users")),
    type: v.union(
      v.literal("onboarding"),
      v.literal("coaching"),
      v.literal("other")
    ),
    source: v.union(v.literal("calendly"), v.literal("manual")),
    calendlyEventUri: v.optional(v.string()),
    calendlyInviteeUri: v.optional(v.string()),
    googleEventId: v.optional(v.string()),
    meetUrl: v.optional(v.string()),
    curriculumItemId: v.optional(v.id("curriculum")),
    // Fireflies (résumé auto du call).
    firefliesId: v.optional(v.string()),
    transcriptUrl: v.optional(v.string()),
    aiSummary: v.optional(v.string()),
    scheduledAt: v.number(),
    endAt: v.optional(v.number()),
    status: v.union(
      v.literal("scheduled"),
      v.literal("completed"),
      v.literal("canceled"),
      v.literal("no_show")
    ),
    summary: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_scheduledAt", ["scheduledAt"])
    .index("by_status", ["status"])
    .index("by_calendly_event", ["calendlyEventUri"]),

  modules: defineTable({
    title: v.string(),
    slug: v.string(),
    description: v.string(),
    order: v.number(),
    iconName: v.optional(v.string()),
    badgeLabel: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_order", ["order"]),

  lessons: defineTable({
    moduleId: v.id("modules"),
    title: v.string(),
    slug: v.string(),
    description: v.string(),
    order: v.number(),
    muxAssetId: v.string(),
    muxPlaybackId: v.string(),
    durationSeconds: v.number(),
    xpReward: v.number(),
    // Si true, la leçon est accessible en mode preview gratuit
    // (user loggué Discord sans purchaseId). Sinon, elle est verrouillée.
    previewAccess: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_module", ["moduleId"])
    .index("by_module_order", ["moduleId", "order"])
    .index("by_slug", ["slug"]),

  exercises: defineTable({
    lessonId: v.id("lessons"),
    title: v.string(),
    contentMarkdown: v.string(),
    exerciseUrl: v.optional(v.string()),
    config: v.optional(v.string()), // JSON config defining exercise structure
    type: v.union(
      v.literal("checkbox"),
      v.literal("qcm"),
      v.literal("text")
    ),
    qcmOptions: v.optional(
      v.array(
        v.object({
          label: v.string(),
          isCorrect: v.boolean(),
        })
      )
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  }).index("by_lesson", ["lessonId"]),

  // Outils / ressources statiques (templates, cheat-sheets, PDF…)
  // Affichés dans /dashboard/outils section "Outils". Alimenté depuis l'admin.
  tools: defineTable({
    title: v.string(),
    description: v.string(),
    fileUrl: v.string(), // URL publique ou relative
    category: v.optional(v.string()), // ex: "template", "cheatsheet", "ressource"
    iconName: v.optional(v.string()),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  }).index("by_order", ["order"]),

  exerciseResponses: defineTable({
    userId: v.id("users"),
    exerciseId: v.id("exercises"),
    data: v.string(), // JSON stringified response data
    progressPercent: v.number(),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_user_exercise", ["userId", "exerciseId"])
    .index("by_user", ["userId"]),

  progress: defineTable({
    userId: v.id("users"),
    lessonId: v.id("lessons"),
    videoWatchedAt: v.optional(v.number()),
    videoProgressPct: v.number(),
    exerciseCompletedAt: v.optional(v.number()),
    exerciseAnswer: v.optional(v.string()),
    lessonCompletedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_lesson", ["userId", "lessonId"]),

  comments: defineTable({
    lessonId: v.id("lessons"),
    userId: v.id("users"),
    content: v.string(),
    parentCommentId: v.optional(v.id("comments")),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_lesson", ["lessonId"])
    .index("by_user", ["userId"])
    .index("by_parent", ["parentCommentId"]),

  badges: defineTable({
    userId: v.id("users"),
    moduleId: v.id("modules"),
    label: v.string(),
    unlockedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_module", ["userId", "moduleId"]),

  onboardingNotes: defineTable({
    userId: v.id("users"),
    scheduledAt: v.optional(v.number()),
    completedByAdminId: v.optional(v.id("users")),
    completedAt: v.optional(v.number()),
    notes: v.string(),
  }).index("by_user", ["userId"]),

  notes: defineTable({
    userId: v.id("users"),
    lessonId: v.id("lessons"),
    content: v.string(),
    timestampSeconds: v.optional(v.number()), // video timestamp in seconds
    updatedAt: v.number(),
  })
    .index("by_user_lesson", ["userId", "lessonId"]),

  announcements: defineTable({
    title: v.string(),
    body: v.string(),
    createdByAdminId: v.id("users"),
    createdAt: v.number(),
    scope: v.union(
      v.literal("all"),
      v.literal("vip"),
      v.literal("pending")
    ),
    // Accent color pour afficher la news (choisie parmi la palette modules)
    accent: v.optional(v.string()),
    // Si défini, la news disparaît automatiquement après cette date
    expiresAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_createdAt", ["createdAt"]),

  // Campagnes CRM (segmentation + envoi groupé) — Brique E.
  // Une ligne = un envoi (segment + canal). Historique côté admin.
  campaigns: defineTable({
    channel: v.union(v.literal("email"), v.literal("whatsapp")),
    segment: v.string(),
    subject: v.optional(v.string()),
    body: v.string(),
    recipientCount: v.number(),
    createdAt: v.number(),
  }).index("by_at", ["createdAt"]),

  notifications: defineTable({
    userId: v.id("users"),
    type: v.union(
      v.literal("comment_reply"),
      v.literal("new_content"),
      v.literal("badge_earned"),
      v.literal("new_comment")
    ),
    message: v.string(),
    read: v.boolean(),
    lessonId: v.optional(v.id("lessons")),
    commentId: v.optional(v.id("comments")),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_unread", ["userId", "read"]),
});
