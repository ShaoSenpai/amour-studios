"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { use, useEffect, useMemo, useState } from "react";
import Script from "next/script";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import {
  ACCENT,
  palette,
  useIsDark,
  mono,
  num,
  Glass,
  glassBtn,
  GlassButton,
} from "../../studio/_components/glass";

// ============================================================================
// /onboarding/[token] — parcours en 2-3 étapes.
//
// Coaching (179€) : 1) contact  2) questionnaire  3) RDV Calendly.
// Communauté (79€) : 1) contact  2) questionnaire (court).
// Le token est lu côté Convex (`onboardings.getByToken`). Mutations publiques
// (`submitContact`, `submitAnswers`, `markRdvBooked`) acceptent le token comme
// secret partagé — pas d'auth requise.
// ============================================================================

const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ??
  "https://calendly.com/amourstudios/onboarding";

const DISCORD_INVITE =
  process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ??
  "https://discord.gg/amourstudios";

// Vidéo « quick win » de l'écran post-questionnaire (coaching). Lecteur Mux
// chargé côté client uniquement (web component → pas de SSR). Si le playback ID
// n'est pas configuré, l'écran s'affiche sans lecteur (dégradé propre).
const QUICKWIN_MUX_PLAYBACK_ID =
  process.env.NEXT_PUBLIC_ONBOARDING_QUICKWIN_MUX_PLAYBACK_ID ?? "";
const MuxPlayer = dynamic(() => import("@mux/mux-player-react"), { ssr: false });

// Questions du questionnaire — coaching 179€ (10 questions).
const COACHING_QUESTIONS = [
  { key: "artist_name", label: "Ton nom d'artiste / pseudo ?", placeholder: "ex. SHAOSENPAI" },
  { key: "style", label: "Style musical principal + 2-3 artistes de référence", placeholder: "ex. Trap mélodique — refs : Werenoi, Tiakola, Niska" },
  { key: "level", label: "Où en es-tu ?", placeholder: "Je débute / J'ai déjà sorti des morceaux / Je suis pro" },
  { key: "platform", label: "Plateforme principale aujourd'hui", placeholder: "Instagram / TikTok / YouTube / Spotify / autre" },
  { key: "links", label: "Tes comptes (liens Insta, TikTok, autres)", placeholder: "https://instagram.com/… , https://tiktok.com/@…" },
  { key: "followers", label: "Combien d'abonnés au total environ ?", placeholder: "ex. ~2k toutes plateformes confondues" },
  { key: "goal_3m", label: "Ton objectif à 3 mois ?", placeholder: "ex. atteindre 10k abonnés Instagram + 1 collab" },
  { key: "goal_1y", label: "Ton objectif à 1 an ?", placeholder: "ex. signer en label / vivre de ma musique" },
  { key: "blocker", label: "Qu'est-ce qui te bloque le plus aujourd'hui ?", placeholder: "ex. créer du contenu régulier, manque de visibilité…" },
  { key: "expectations", label: "Qu'attends-tu concrètement de ton coaching avec Walid ?", placeholder: "ex. structurer ma stratégie, débloquer mon contenu…" },
] as const;

// Questions communauté 79€ (6 questions — 3 ouvertes + 3 signal upsell).
type CommunityQuestion =
  | { key: string; label: string; placeholder: string; type?: "textarea" }
  | { key: string; label: string; type: "select"; options: readonly string[]; placeholder?: string }
  | { key: string; label: string; type: "scale"; min: number; max: number; minLabel: string; maxLabel: string };

const COMMUNITY_QUESTIONS: readonly CommunityQuestion[] = [
  { key: "source", label: "D'où viens-tu ?", placeholder: "Insta / TikTok / YouTube / bouche-à-oreille / pub / autre" },
  { key: "project", label: "Ton projet / style en 2 lignes", placeholder: "ex. artiste rap mélodique, je sors mon 1er EP en septembre" },
  { key: "expectations", label: "Qu'attends-tu de la communauté ?", placeholder: "ex. du feedback, échanger avec d'autres artistes, motivation" },
  {
    key: "time_per_week",
    label: "Combien de temps tu mets par semaine sur ta musique ?",
    type: "select",
    options: ["Moins de 5h", "5-10h", "10-20h", "Plus de 20h"],
  },
  {
    key: "objective_6m",
    label: "Ton objectif principal sur les 6 prochains mois ?",
    type: "select",
    options: ["Grossir mon audience", "Sortir mon 1er projet", "Vivre de ma musique", "Autre"],
  },
  {
    key: "stuck_level",
    label: "À quel point tu te sens bloqué dans ta progression ?",
    type: "scale",
    min: 1,
    max: 10,
    minLabel: "Pas du tout",
    maxLabel: "Énormément",
  },
] as const;

// Renvoie true si le profil communauté mérite qu'on lui propose l'upsell coaching.
function shouldShowUpsell(answers: Record<string, string>): boolean {
  if (answers.objective_6m === "Vivre de ma musique") return true;
  const stuck = parseInt(answers.stuck_level ?? "", 10);
  if (!Number.isNaN(stuck) && stuck >= 7) return true;
  return false;
}

const COACHING_UPSELL_URL = "https://amourstudios.fr/paiement?offre=coaching";

type StepKey = "loading" | "invalid" | "contact" | "questions" | "quickwin" | "rdv" | "upsell" | "done";

export default function OnboardingTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const dark = useIsDark();
  const c = palette(dark, ACCENT);

  const data = useQuery(api.onboardings.getByToken, { token });
  const submitContact = useMutation(api.onboardings.submitContact);
  const submitAnswers = useMutation(api.onboardings.submitAnswers);
  const markRdvBooked = useMutation(api.onboardings.markRdvBooked);
  // Upsell Communauté → Coaching (écran de fin, fenêtre 1h).
  const offer = useQuery(api.onboardings.upgradeOffer, { token });
  const upgradeToCoaching = useAction(api.stripe.upgradeToCoaching);

  // État local UI.
  const [step, setStep] = useState<StepKey>("loading");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // Upsell : masquage local ("Non merci") + état d'activation du débit.
  const [upsellDismissed, setUpsellDismissed] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  // Handler du débit +100€ off-session puis bascule coaching. Le succès patche
  // l'onboarding (→ tier coaching/form_done) : `data` (useQuery réactif) se met
  // à jour seul et la page enchaîne automatiquement sur l'étape RDV coaching.
  const handleUpgrade = async () => {
    if (upgrading) return;
    setUpgrading(true);
    try {
      const res = await upgradeToCoaching({ token });
      if (res.already) {
        toast.success("Coaching déjà actif.");
      } else {
        toast.success("🎉 Coaching débloqué !");
      }
      // Pas de setStep manuel : on laisse la query réactive piloter l'écran.
    } catch (err) {
      toast.error((err as Error).message ?? "Le paiement a échoué.");
    } finally {
      setUpgrading(false);
    }
  };

  // Détermine l'étape initiale depuis l'état serveur.
  useEffect(() => {
    if (data === undefined) {
      setStep("loading");
      return;
    }
    if (data === null) {
      setStep("invalid");
      return;
    }
    setFirstName(data.firstName ?? "");
    setLastName(data.lastName ?? "");
    setPhone(data.phone ?? "");
    // Hydrate les réponses existantes.
    const map: Record<string, string> = {};
    for (const a of data.answers ?? []) map[a.key] = a.value;
    setAnswers(map);
    if (data.step === "rdv_booked" || data.step === "community_ready") {
      setStep("done");
    } else if (data.step === "form_done" && data.tier === "coaching") {
      setStep("rdv");
    } else if (data.firstName && data.lastName && data.phone) {
      setStep("questions");
    } else {
      setStep("contact");
    }
  }, [data]);

  // Écoute les events Calendly (event_scheduled) pour avancer auto à "done".
  useEffect(() => {
    if (step !== "rdv") return;
    const onMessage = async (e: MessageEvent) => {
      if (typeof e.origin !== "string") return;
      if (!e.origin.includes("calendly.com")) return;
      const ev = (e.data as { event?: string } | null)?.event;
      if (ev === "calendly.event_scheduled") {
        try {
          await markRdvBooked({ token });
          setStep("done");
          toast.success("RDV réservé. À bientôt !");
        } catch (err) {
          console.error(err);
        }
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [step, token, markRdvBooked]);

  const tier = data?.tier ?? "coaching";
  const questions = useMemo<readonly { key: string; label: string }[]>(
    () => (tier === "coaching" ? COACHING_QUESTIONS : COMMUNITY_QUESTIONS),
    [tier]
  );
  const totalSteps = tier === "coaching" ? 3 : 2;
  const currentNum = step === "contact" ? 1 : step === "questions" ? 2 : 3;

  const handleSubmitContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!firstName.trim() || !lastName.trim() || phone.trim().length < 6) {
      toast.error("Tous les champs sont requis.");
      return;
    }
    setBusy(true);
    try {
      await submitContact({
        token,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
      });
      setStep("questions");
    } catch (err) {
      toast.error((err as Error).message ?? "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitAnswers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    // Vérifie qu'au moins 80% des questions ont une réponse (souplesse).
    const filled = questions.filter((q) => (answers[q.key] ?? "").trim().length > 0).length;
    if (filled < Math.ceil(questions.length * 0.8)) {
      toast.error("Réponds à toutes les questions (ou presque) avant de continuer.");
      return;
    }
    setBusy(true);
    try {
      const arr = questions.map((q) => ({
        key: q.key,
        label: q.label,
        value: (answers[q.key] ?? "").trim(),
      }));
      await submitAnswers({ token, answers: arr, finalize: true });
      if (tier === "coaching") {
        // Interstitiel « quick win » (vidéo de félicitation/préparation) avant
        // le RDV. One-shot : sur reload, le mapping réactif renvoie direct à "rdv".
        // Si la vidéo Mux n'est pas configurée, on saute l'écran (pas d'écran
        // vide qui parlerait d'une vidéo absente) → RDV direct.
        setStep("quickwin");
      } else if (shouldShowUpsell(answers)) {
        setStep("upsell");
      } else {
        setStep("done");
      }
    } catch (err) {
      toast.error((err as Error).message ?? "Erreur");
    } finally {
      setBusy(false);
    }
  };

  // URL Calendly avec pré-remplissage (fail-silent si env vide/invalide).
  const calendlyEmbedUrl = useMemo(() => {
    const raw = (CALENDLY_URL || "").trim();
    if (!raw) return "";
    try {
      const u = new URL(raw);
      // Pré-remplit nom + email Calendly (le client doit pas retaper).
      if (firstName || lastName)
        u.searchParams.set("name", `${firstName} ${lastName}`.trim());
      if (data?.email) u.searchParams.set("email", data.email);
      // Fallback : tracking utm_source = token onboarding. Si le client édite
      // l'email côté Calendly, on retrouve quand même le user via le token.
      u.searchParams.set("utm_source", `onboarding-${token}`);
      u.searchParams.set("hide_event_type_details", "0");
      return u.toString();
    } catch {
      return raw;
    }
  }, [firstName, lastName, data?.email, token]);

  // --- Rendu ---------------------------------------------------------------

  if (step === "loading") {
    return (
      <Shell c={c} dark={dark}>
        <div style={{ ...mono, color: c.muted, padding: "20px 0" }}>Chargement…</div>
      </Shell>
    );
  }

  if (step === "invalid") {
    return (
      <Shell c={c} dark={dark}>
        <div>
          <div style={{ ...mono, color: ACCENT }}>◦ Lien invalide</div>
          <h1 style={{ ...num, fontSize: 32, fontWeight: 500, margin: "10px 0 0" }}>
            Ce lien n&apos;est pas valide.
          </h1>
          <p style={{ fontSize: 14.5, color: c.muted, marginTop: 12, lineHeight: 1.55 }}>
            Le lien a peut-être été modifié ou n&apos;a pas encore été généré.
            Si tu viens de te présenter sur Discord, attends quelques minutes
            puis recharge ton email — sinon contacte-nous.
          </p>
        </div>
      </Shell>
    );
  }

  if (step === "done") {
    const showUpsell = offer?.eligible === true && !upsellDismissed;
    return (
      <Shell c={c} dark={dark}>
        {showUpsell && (
          <UpsellBlock
            c={c}
            offer={offer}
            upgrading={upgrading}
            onUpgrade={handleUpgrade}
            onDismiss={() => setUpsellDismissed(true)}
          />
        )}
        <div>
          <div style={{ ...mono, color: ACCENT }}>◦ Accès débloqué ✓</div>
          <h1 style={{ ...num, fontSize: 36, fontWeight: 500, lineHeight: 1.05, margin: "10px 0 0" }}>
            {tier === "coaching" ? "À très vite avec Walid." : "Bienvenue dans la communauté."}
          </h1>
          <p style={{ fontSize: 14.5, color: c.text, marginTop: 14, lineHeight: 1.55 }}>
            <strong>Ton accès Discord complet est maintenant débloqué.</strong>{" "}
            Tu peux écrire dans tous les channels, partager ta musique, demander
            du feedback et participer aux lives.
          </p>
          <p style={{ fontSize: 13.5, color: c.muted, marginTop: 10, lineHeight: 1.55 }}>
            {tier === "coaching"
              ? "Ton 1er appel avec Walid est noté dans son calendrier. Tu recevras une confirmation par email avec le lien du Meet."
              : "On t'attend sur le Discord. À très vite."}
          </p>

          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener noreferrer"
            className="glass-btn"
            style={{
              ...glassBtn(c, "solid"),
              marginTop: 22,
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              textDecoration: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <DiscordIcon />
            Aller sur Discord →
          </a>
          <p
            style={{
              ...mono,
              fontSize: 9.5,
              color: c.faint,
              textAlign: "center",
              marginTop: 10,
              lineHeight: 1.4,
            }}
          >
            Direction <strong style={{ color: c.muted }}>#💬・général</strong>
            {tier === "coaching" ? " ou présente-toi à Walid" : ""}
          </p>
        </div>
      </Shell>
    );
  }

  if (step === "quickwin") {
    return (
      <Shell c={c} dark={dark}>
        <div>
          <div style={{ ...mono, color: ACCENT }}>◦ Questionnaire validé ✓</div>
          <h1 style={{ ...num, fontSize: 34, fontWeight: 500, lineHeight: 1.05, margin: "10px 0 0" }}>
            {firstName ? `Bravo ${firstName},` : "Bravo,"} tu y es presque.
          </h1>
          <p style={{ fontSize: 14.5, color: c.text, marginTop: 14, lineHeight: 1.55 }}>
            Avant de réserver ton 1er appel, prends 2 minutes pour cette vidéo :
            Walid t&apos;explique comment préparer ce premier RDV pour en tirer le maximum.
          </p>
          {QUICKWIN_MUX_PLAYBACK_ID ? (
            <div
              style={{
                marginTop: 18,
                borderRadius: 14,
                overflow: "hidden",
                border: `1px solid ${c.line}`,
                aspectRatio: "16 / 9",
                background: "#000",
              }}
            >
              <MuxPlayer
                playbackId={QUICKWIN_MUX_PLAYBACK_ID}
                streamType="on-demand"
                accentColor={ACCENT}
                style={{ width: "100%", height: "100%" }}
              />
            </div>
          ) : (
            // Placeholder tant que la vidéo de bienvenue n'est pas branchée
            // (env NEXT_PUBLIC_ONBOARDING_QUICKWIN_MUX_PLAYBACK_ID).
            <div
              style={{
                marginTop: 18,
                borderRadius: 14,
                border: `1px dashed ${c.line}`,
                aspectRatio: "16 / 9",
                background: c.chip,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 26 }}>🎬</div>
              <div style={{ ...mono, fontSize: 10, color: c.muted, letterSpacing: "0.08em" }}>
                VIDÉO DE BIENVENUE
              </div>
              <div style={{ ...mono, fontSize: 9, color: c.faint }}>bientôt disponible</div>
            </div>
          )}
          <GlassButton
            c={c}
            kind="solid"
            onClick={() => setStep("rdv")}
            style={{
              marginTop: 22,
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            Continuer → réserver mon 1er RDV
          </GlassButton>
          <p style={{ ...mono, fontSize: 9.5, color: c.faint, textAlign: "center", marginTop: 10 }}>
            Dernière étape avant ton accès complet
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell c={c} dark={dark}>
      {step !== "upsell" && <UnlockBanner c={c} tier={tier} />}
      {step !== "upsell" && <StepBar c={c} current={currentNum} total={totalSteps} />}

      {step === "contact" && (
        <form onSubmit={handleSubmitContact} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ ...mono, color: c.muted }}>Étape 1 sur {totalSteps}</div>
            <h1 style={{ ...num, fontSize: 30, fontWeight: 500, lineHeight: 1.1, margin: "8px 0 0" }}>
              Tes coordonnées.
            </h1>
            <p style={{ fontSize: 13.5, color: c.muted, marginTop: 8 }}>
              Pour qu&apos;on puisse te recontacter et t&apos;envoyer le lien Meet.
              {tier === "coaching" ? " Toutes les 3 étapes sont obligatoires pour débloquer ton accès Discord." : " Les 2 étapes sont obligatoires pour débloquer ton accès Discord."}
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field c={c} label="Prénom">
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} style={inputStyle(c)} placeholder="Maxime" required />
            </Field>
            <Field c={c} label="Nom">
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} style={inputStyle(c)} placeholder="Lefèvre" required />
            </Field>
          </div>
          <Field c={c} label="Téléphone (WhatsApp)">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle(c)} placeholder="+33 6 12 34 56 78" type="tel" required />
          </Field>
          <GlassButton c={c} kind="solid" type="submit" disabled={busy} style={{ padding: "13px 16px", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Enregistrement…" : "Continuer →"}
          </GlassButton>
        </form>
      )}

      {step === "questions" && (
        <form onSubmit={handleSubmitAnswers} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ ...mono, color: c.muted }}>Étape 2 sur {totalSteps}</div>
            <h1 style={{ ...num, fontSize: 30, fontWeight: 500, lineHeight: 1.1, margin: "8px 0 0" }}>
              {tier === "coaching" ? "Parle-nous de toi." : "Quelques questions courtes."}
            </h1>
            <p style={{ fontSize: 13.5, color: c.muted, marginTop: 8 }}>
              {tier === "coaching"
                ? "Pour que Walid arrive à ton 1er appel avec déjà du contexte sur toi (~5 min). Étape obligatoire."
                : "Pour qu'on te connaisse mieux (~2 min). Dernière étape — après ça, ton accès Discord complet est débloqué."}
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {questions.map((q) => {
              const cq = q as CommunityQuestion;
              if ("type" in cq && cq.type === "select") {
                return (
                  <Field key={q.key} c={c} label={q.label}>
                    <select
                      value={answers[q.key] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                      style={{ ...inputStyle(c), appearance: "none", cursor: "pointer" }}
                    >
                      <option value="" disabled>Choisis…</option>
                      {cq.options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </Field>
                );
              }
              if ("type" in cq && cq.type === "scale") {
                const cur = parseInt(answers[q.key] ?? "", 10);
                return (
                  <Field key={q.key} c={c} label={q.label}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {Array.from({ length: cq.max - cq.min + 1 }, (_, i) => cq.min + i).map((n) => {
                          const active = cur === n;
                          return (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setAnswers((a) => ({ ...a, [q.key]: String(n) }))}
                              style={{
                                flex: 1,
                                padding: "10px 0",
                                background: active ? ACCENT : c.chip,
                                color: active ? "#0B0B0B" : c.text,
                                border: `1px solid ${active ? ACCENT : c.line}`,
                                borderRadius: 8,
                                fontFamily: "inherit",
                                fontSize: 13,
                                fontWeight: active ? 600 : 400,
                                cursor: "pointer",
                                transition: "background 150ms ease",
                              }}
                            >
                              {n}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ ...mono, fontSize: 9, color: c.faint, display: "flex", justifyContent: "space-between" }}>
                        <span>{cq.minLabel}</span>
                        <span>{cq.maxLabel}</span>
                      </div>
                    </div>
                  </Field>
                );
              }
              const placeholder = "placeholder" in cq ? cq.placeholder : "";
              return (
                <Field key={q.key} c={c} label={q.label}>
                  <textarea
                    rows={2}
                    value={answers[q.key] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                    style={{ ...inputStyle(c), resize: "vertical", lineHeight: 1.5 }}
                    placeholder={placeholder}
                  />
                </Field>
              );
            })}
          </div>
          <GlassButton c={c} kind="solid" type="submit" disabled={busy} style={{ padding: "13px 16px", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Enregistrement…" : tier === "coaching" ? "Continuer → Réserver le RDV" : "Terminer"}
          </GlassButton>
        </form>
      )}

      {step === "upsell" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div style={{ ...mono, color: ACCENT }}>◦ ON T&apos;A LU</div>
            <h1 style={{ ...num, fontSize: 30, fontWeight: 500, lineHeight: 1.1, margin: "10px 0 0" }}>
              Tu vises plus loin que la communauté.
            </h1>
            <p style={{ fontSize: 14, color: c.text, marginTop: 12, lineHeight: 1.6 }}>
              Vu tes réponses, t&apos;es pas là pour faire de la musique tranquille le dimanche.
              T&apos;as un vrai objectif et t&apos;es bloqué sur des trucs précis. La communauté ça va t&apos;aider,
              mais franchement, pour ton cas, ça suffira pas tout seul.
            </p>
            <p style={{ fontSize: 14, color: c.text, marginTop: 10, lineHeight: 1.6 }}>
              Le coaching head-to-head avec Walid, c&apos;est exactement pour les profils comme toi :
              1 RDV par semaine, méthode adaptée à ton projet, on regarde ce que tu sors, on corrige, on avance.
            </p>
          </div>

          <div
            style={{
              padding: "14px 16px",
              background: `${ACCENT}10`,
              border: `1px solid ${ACCENT}55`,
              borderRadius: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ ...mono, fontSize: 10, color: ACCENT, letterSpacing: "0.06em" }}>
              CE QUE ÇA CHANGE
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                "1 RDV par semaine avec Walid (1h)",
                "Méthode perso pour ton projet",
                "Feedback détaillé sur ton contenu chaque semaine",
              ].map((line) => (
                <li
                  key={line}
                  style={{
                    fontSize: 13.5,
                    color: c.text,
                    lineHeight: 1.5,
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                  }}
                >
                  <span style={{ color: ACCENT, marginTop: 2, fontWeight: 600 }}>→</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <a
            href={COACHING_UPSELL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="glass-btn"
            style={{
              ...glassBtn(c, "solid"),
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            Passer en Coaching 179€/mois →
          </a>

          <GlassButton
            c={c}
            kind="ghost"
            onClick={() => setStep("done")}
            style={{
              padding: "12px 16px",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            Non merci, je reste en Communauté
          </GlassButton>

          <p style={{ ...mono, fontSize: 9.5, color: c.faint, textAlign: "center", lineHeight: 1.4 }}>
            Tu peux y revenir plus tard depuis Discord — l&apos;offre reste ouverte.
          </p>
        </div>
      )}

      {step === "rdv" && (
        <div>
          <div>
            <div style={{ ...mono, color: c.muted }}>Étape 3 sur {totalSteps} · dernière</div>
            <h1 style={{ ...num, fontSize: 30, fontWeight: 500, lineHeight: 1.1, margin: "8px 0 0" }}>
              Réserve ton 1er appel.
            </h1>
            <p style={{ fontSize: 14, color: c.text, marginTop: 10, lineHeight: 1.55 }}>
              <strong>Ce RDV est obligatoire</strong> pour débloquer ton accès complet
              au Discord (écriture dans tous les channels). Tant qu&apos;il n&apos;est pas réservé,
              tu ne peux pas écrire dans les channels.
            </p>
            <p style={{ fontSize: 13.5, color: c.muted, marginTop: 8 }}>
              Choisis un créneau qui te va. Tu recevras le lien Meet par email + Discord.
            </p>
          </div>
          {/* Calendly inline widget */}
          <div
            className="calendly-inline-widget"
            data-url={calendlyEmbedUrl}
            style={{ minWidth: 320, height: 720, marginTop: 18, borderRadius: 14, overflow: "hidden", border: `1px solid ${c.line}` }}
          />
          <Script
            src="https://assets.calendly.com/assets/external/widget.js"
            strategy="afterInteractive"
          />
          <p style={{ ...mono, fontSize: 9.5, color: c.faint, marginTop: 14, textAlign: "center" }}>
            Tu peux fermer cette page une fois ton créneau confirmé — tout est sauvegardé.
          </p>
        </div>
      )}
    </Shell>
  );
}

// --- Sous-composants ------------------------------------------------------

type C = ReturnType<typeof palette>;

function Shell({ c, dark, children }: { c: C; dark: boolean; children: React.ReactNode }) {
  return (
    <main
      style={{
        background: c.bgGrad,
        color: c.text,
        minHeight: "100vh",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
        padding: "48px 20px",
      }}
    >
      <Glass c={c} dark={dark} strong pad={0} style={{ width: "100%", maxWidth: 620, overflow: "hidden" }}>
        <div style={{ padding: "32px 30px 36px", display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 32, height: 32, background: ACCENT, color: "#0B0B0B", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 17, borderRadius: 8, letterSpacing: "-0.02em" }}>
              A
            </div>
            <div>
              <div style={{ ...mono, fontSize: 10.5, letterSpacing: "0.06em" }}>AMOUR STUDIOS</div>
              <div style={{ ...mono, fontSize: 9, color: c.muted, marginTop: 2 }}>ONBOARDING</div>
            </div>
          </div>
          {children}
        </div>
      </Glass>
    </main>
  );
}

function UnlockBanner({
  c,
  tier,
}: {
  c: C;
  tier: "coaching" | "communaute";
}) {
  const label =
    tier === "coaching"
      ? "Complète les 3 étapes pour débloquer ton accès Discord complet"
      : "Complète les 2 étapes pour débloquer ton accès Discord complet";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        background: `${ACCENT}1A`,
        border: `1px solid ${ACCENT}55`,
        borderRadius: 12,
        marginBottom: -6,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: ACCENT,
          flexShrink: 0,
        }}
      />
      <span style={{ ...mono, fontSize: 10.5, color: c.text, lineHeight: 1.4 }}>
        {label}
      </span>
    </div>
  );
}

// Offre éligible (variante "true" du retour de api.onboardings.upgradeOffer).
type EligibleOffer = {
  eligible: true;
  firstName: string | null;
  currentEur: number;
  coachingEur: number;
  feeEur: number;
  expiresAt: number;
};

/** Bloc d'upsell émotionnel Communauté → Coaching, affiché au-dessus du message
 *  de fin (écran "done") quand l'offre 1h est encore éligible. Débit +100€
 *  one-time off-session en 1 clic. */
function UpsellBlock({
  c,
  offer,
  upgrading,
  onUpgrade,
  onDismiss,
}: {
  c: C;
  offer: EligibleOffer;
  upgrading: boolean;
  onUpgrade: () => void;
  onDismiss: () => void;
}) {
  const hi = offer.firstName ? `${offer.firstName}, t` : "T";
  return (
    <Glass
      c={c}
      dark={c.dark}
      strong
      tint={`${ACCENT}14`}
      style={{ border: `1px solid ${ACCENT}66`, marginBottom: 4 }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ ...mono, fontSize: 10, color: ACCENT, letterSpacing: "0.08em" }}>
          ◦ OFFRE — MAINTENANT SEULEMENT
        </div>
        <h2
          style={{
            ...num,
            fontSize: 26,
            fontWeight: 500,
            lineHeight: 1.1,
            margin: 0,
            color: c.text,
          }}
        >
          Débloque le coaching avec Walid.
        </h2>
        <p style={{ fontSize: 14, color: c.text, margin: 0, lineHeight: 1.6 }}>
          {hi}u as l&apos;offre d&apos;entrée Communauté ({offer.currentEur}€). Le
          vrai déclic, c&apos;est le coaching 1:1 avec Walid : ta méthode, tes RDV,
          tes exos. Tu paies juste la <strong>différence (+{offer.feeEur}€)</strong>{" "}
          pour passer au coaching à <strong>{offer.coachingEur}€/mois</strong>.
          C&apos;est maintenant ou jamais : après cette page, l&apos;offre disparaît.
        </p>

        {/* Math claire : 49€ payé → +130€ aujourd'hui → 179€/mois plein. */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            padding: "12px 16px",
            background: c.chip,
            border: `1px solid ${c.line}`,
            borderRadius: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ ...mono, fontSize: 11, color: c.muted }}>
            {offer.currentEur}€ payé
          </span>
          <span style={{ ...mono, fontSize: 14, color: c.muted }}>+</span>
          <span style={{ ...num, fontSize: 34, fontWeight: 600, color: ACCENT, lineHeight: 1 }}>
            {offer.feeEur}€
          </span>
          <span style={{ ...mono, fontSize: 14, color: c.muted }}>=</span>
          <span style={{ ...num, fontSize: 20, fontWeight: 600, color: c.text }}>
            {offer.coachingEur}€<span style={{ ...mono, fontSize: 11, color: c.muted }}>/mois</span>
          </span>
          <span style={{ ...mono, fontSize: 9.5, color: c.muted, marginLeft: "auto", width: "100%", textAlign: "right", marginTop: 2 }}>
            +{offer.feeEur}€ une seule fois · puis {offer.coachingEur}€/mois · engagement 3 mois
          </span>
        </div>

        <GlassButton
          c={c}
          kind="solid"
          onClick={onUpgrade}
          disabled={upgrading}
          style={{
            padding: "15px 18px",
            fontSize: 12,
            opacity: upgrading ? 0.6 : 1,
            cursor: upgrading ? "default" : "pointer",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          {upgrading ? "Activation…" : `Débloquer le coaching · +${offer.feeEur}€`}
        </GlassButton>

        <button
          type="button"
          onClick={onDismiss}
          disabled={upgrading}
          style={{
            background: "none",
            border: "none",
            color: c.muted,
            fontFamily: "inherit",
            fontSize: 12.5,
            cursor: upgrading ? "default" : "pointer",
            textDecoration: "underline",
            textUnderlineOffset: 3,
            padding: 0,
            alignSelf: "center",
          }}
        >
          Non merci, rester en communauté
        </button>

        <p style={{ ...mono, fontSize: 9, color: c.faint, textAlign: "center", lineHeight: 1.4, margin: 0 }}>
          Débité en 1 clic sur ta carte enregistrée · sécurisé par Stripe
        </p>
      </div>
    </Glass>
  );
}

function StepBar({ c, current, total }: { c: C; current: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {Array.from({ length: total }, (_, i) => {
        const done = i + 1 < current;
        const active = i + 1 === current;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 3,
              background: done || active ? ACCENT : c.chip,
              opacity: active ? 1 : done ? 0.8 : 1,
              transition: "background 200ms ease",
            }}
          />
        );
      })}
    </div>
  );
}

function Field({
  c,
  label,
  children,
}: {
  c: C;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ ...mono, fontSize: 9.5, color: c.muted }}>{label}</span>
      {children}
    </label>
  );
}

function DiscordIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.298 12.298 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function inputStyle(c: C): React.CSSProperties {
  return {
    background: c.chip,
    border: `1px solid ${c.line}`,
    borderRadius: 10,
    padding: "11px 13px",
    color: c.text,
    outline: "none",
    fontFamily: "inherit",
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
    colorScheme: c.dark ? "dark" : "light",
  };
}
