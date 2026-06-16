"use client";

import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Loader2, Mail, MessageCircle, Megaphone } from "lucide-react";
import { toast } from "sonner";
import {
  ACCENT,
  palette,
  useIsDark,
  mono,
  num,
  Glass,
  Pill,
  Segmented,
  GlassButton,
  fmtDateShort,
  fmtTime,
  useIsMobile,
  SPACE,
  type C,
} from "../_components/glass";
import { MobileSheet } from "../_components/mobile-sheet";
import { useTestMode } from "../_components/test-mode";
import {
  useTestStore,
  testStore,
  selectSegments,
  selectSegmentMembers,
  selectCampaigns,
} from "../_components/test-store";

// ============================================================================
// Campagnes — segmentation CRM + envoi email / WhatsApp (Brique E, Glass Chunky).
// ----------------------------------------------------------------------------
// Colonne gauche : cartes de segments (api.segments.listSegments) + membres du
// segment sélectionné (api.segments.segmentMembers) avec export presse-papier.
// Colonne droite : composer (canal, objet, corps, aperçu, test, envoi en masse
// avec dialog de confirmation). Bas : historique (api.campaigns.listCampaigns).
//
// Envoi RÉEL sécurisé par TROIS garde-fous : aperçu du rendu → envoi de test
// vers soi → dialog de confirmation rappelant segment + count + canal.
//
// Mode test (useTestMode) : tout est simulé via le store sandbox, aucun appel
// backend, et `simulateCampaign` pousse un event `campaign.sent` dans la timeline.
// ============================================================================

type Channel = "email" | "whatsapp";

// WhatsApp (Twilio) EN PAUSE : canal masqué dans l'UI tant qu'on ne le maîtrise
// pas. Tout le code backend (campaigns.sendWhatsAppOne) et l'UI WhatsApp restent
// en place — pour réactiver, repasser ce flag à true. Aucune perte.
const WHATSAPP_ENABLED = false;

const PREVIEW_PRENOM = "Maxime";
const PREVIEW_PSEUDO = "mxlo.beats";

/** Rendu de l'aperçu : remplace {prenom}/{pseudo} par des exemples. */
function renderPreview(body: string): string {
  return body
    .replace(/\{prenom\}/g, PREVIEW_PRENOM)
    .replace(/\{pseudo\}/g, PREVIEW_PSEUDO);
}

export default function CampagnesPage() {
  const dark = useIsDark();
  const isMobile = useIsMobile();
  const { testMode } = useTestMode();
  const c = palette(dark, ACCENT);

  // ── Hooks inconditionnels (skip en mode test) ────────────────────────────
  const liveSegments = useQuery(
    api.segments.listSegments,
    testMode ? "skip" : {}
  );
  const liveCampaigns = useQuery(
    api.campaigns.listCampaigns,
    testMode ? "skip" : {}
  );
  const me = useQuery(api.users.current, testMode ? "skip" : {});
  const sendCampaign = useAction(api.campaigns.sendCampaign);
  const sendTest = useAction(api.campaigns.sendTest);
  // Abonnement réactif au store sandbox (re-render à chaque simulation).
  useTestStore();

  // ── Données (réel vs sandbox) ─────────────────────────────────────────────
  const segments = testMode ? selectSegments() : liveSegments;
  const campaigns = testMode ? selectCampaigns() : liveCampaigns;

  // ── État composer ─────────────────────────────────────────────────────────
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [testNumber, setTestNumber] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);

  // Membres du segment sélectionné. Hook inconditionnel : « skip » si rien de
  // sélectionné OU en mode test (où l'on lit le sandbox).
  const liveMembers = useQuery(
    api.segments.segmentMembers,
    !testMode && selectedKey ? { key: selectedKey } : "skip"
  );
  const members = useMemo(() => {
    if (!selectedKey) return [];
    // selectSegmentMembers dépend du store (re-render via useTestStore ci-dessus).
    return testMode ? selectSegmentMembers(selectedKey) : liveMembers ?? [];
  }, [testMode, selectedKey, liveMembers]);

  const selectedSegment = useMemo(
    () => (segments ?? []).find((s) => s.key === selectedKey) ?? null,
    [segments, selectedKey]
  );

  // Destinataires effectivement joignables sur le canal choisi.
  const reachable = useMemo(() => {
    if (channel === "email") return members.filter((m) => m.email).length;
    return members.filter((m) => m.phone).length;
  }, [members, channel]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (segments === undefined) {
    return (
      <main
        style={{
          background: c.bgGrad,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Loader2 className="animate-spin" style={{ color: c.muted }} />
      </main>
    );
  }

  const canSend = selectedSegment != null && body.trim().length > 0;

  // Style de carte pour l'historique sur mobile (Pattern 2).
  const cardStyle = {
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
    padding: 14,
    borderRadius: 14,
    background: c.chip,
    border: `1px solid ${c.line}`,
    width: "100%",
    fontFamily: "inherit",
    color: c.text,
  };
  const chipStyle = {
    ...mono,
    fontSize: 10,
    padding: "3px 8px",
    borderRadius: 999,
    background: c.chip,
    border: `1px solid ${c.line}`,
    color: c.muted,
    textTransform: "none" as const,
    letterSpacing: 0,
    whiteSpace: "nowrap" as const,
  };

  // ── Export presse-papier (emails + numéros) ───────────────────────────────
  const handleExport = async () => {
    if (members.length === 0) {
      toast.error("Aucun membre à exporter.");
      return;
    }
    const emails = members.map((m) => m.email).filter(Boolean) as string[];
    const phones = members.map((m) => m.phone).filter(Boolean) as string[];
    const lines: string[] = [];
    if (emails.length) lines.push(`E-mails (${emails.length}) :`, emails.join(", "));
    if (phones.length) {
      if (lines.length) lines.push("");
      lines.push(`Téléphones (${phones.length}) :`, phones.join(", "));
    }
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(
        `✓ ${emails.length} e-mail(s) · ${phones.length} numéro(s) copiés`
      );
    } catch {
      toast.error("Copie impossible.");
    }
  };

  // ── Envoi d'un test ────────────────────────────────────────────────────────
  const handleSendTest = async () => {
    if (!body.trim()) {
      toast.error("Écris d'abord un corps de message.");
      return;
    }
    const to =
      channel === "email" ? (testMode ? "demo@example.com" : me?.email) : testNumber.trim();
    if (channel === "whatsapp" && !to) {
      toast.error("Saisis un numéro de test.");
      return;
    }
    if (channel === "email" && !to) {
      toast.error("Aucune adresse e-mail sur ton compte.");
      return;
    }

    if (testMode) {
      toast.info(
        channel === "email"
          ? `Mode test — e-mail de test simulé (→ ${to})`
          : `Mode test — message WhatsApp de test simulé (→ ${to})`
      );
      return;
    }

    setTesting(true);
    try {
      const res = await sendTest({
        channel,
        subject: channel === "email" ? subject || undefined : undefined,
        body,
        to: to as string,
      });
      if (res.ok) toast.success(`✓ Test envoyé (→ ${to})`);
      else toast.error("Échec de l'envoi du test.");
    } catch {
      toast.error("Impossible d'envoyer le test.");
    } finally {
      setTesting(false);
    }
  };

  // ── Envoi en masse (après confirmation) ────────────────────────────────────
  const handleConfirmSend = async () => {
    if (!selectedSegment) return;

    if (testMode) {
      testStore.simulateCampaign({
        channel,
        segment: selectedSegment.key,
        subject: channel === "email" ? subject || undefined : undefined,
        body,
        recipientCount: reachable,
      });
      toast.info(`Mode test — campagne simulée (${reachable} destinataires)`);
      setConfirmOpen(false);
      return;
    }

    setSending(true);
    try {
      const res = await sendCampaign({
        segment: selectedSegment.key,
        channel,
        subject: channel === "email" ? subject || undefined : undefined,
        body,
      });
      toast.success(`✓ Campagne envoyée à ${res.sent} personne(s)`);
      setConfirmOpen(false);
    } catch {
      toast.error("Impossible d'envoyer la campagne.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        background: c.bgGrad,
        minHeight: "100vh",
        color: c.text,
        padding: isMobile ? SPACE.md : 26,
        fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        {/* Hero */}
        <Glass c={c} dark={dark} pad={0} strong style={{ overflow: "hidden", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "stretch", flexWrap: "wrap" }}>
            <div style={{ flex: 1, padding: "26px 30px", display: "flex", flexDirection: "column", gap: 10, minWidth: 240 }}>
              <div style={{ ...mono, color: c.muted, display: "flex", alignItems: "center", gap: 8 }}>
                <Megaphone size={13} /> Diffusion · segmentation
              </div>
              <div style={{ ...num, fontSize: 42, fontWeight: 500, lineHeight: 1 }}>
                Campagnes <span style={{ color: c.muted }}>· {segments.length}</span>
              </div>
              <div style={{ fontSize: 14.5, color: c.muted, marginTop: -2 }}>
                Cible un segment, compose ton message et diffuse-le par{" "}
                <span style={{ color: c.text, fontWeight: 500 }}>e-mail</span> ou{" "}
                <span style={{ color: c.text, fontWeight: 500 }}>WhatsApp</span>.
              </div>
            </div>
          </div>
        </Glass>

        {/* Grid principale : segments | composer */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) minmax(0,1.15fr)", gap: 16, alignItems: "start" }}>
          {/* LEFT — Segments + membres */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Glass c={c} dark={dark} pad={0}>
              <div style={{ padding: "18px 22px 12px" }}>
                <div style={{ ...mono, color: c.muted }}>Segments</div>
                <div style={{ ...num, fontSize: 22, fontWeight: 500, marginTop: 4 }}>
                  Choisis ta cible
                </div>
              </div>
              <div style={{ padding: "4px 14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                {segments.map((s) => {
                  const active = s.key === selectedKey;
                  return (
                    <button
                      key={s.key}
                      onClick={() => setSelectedKey(s.key)}
                      style={{
                        textAlign: "left",
                        cursor: "pointer",
                        background: active ? c.glassStrong : c.chip,
                        border: `1px solid ${active ? "transparent" : c.line}`,
                        outline: active ? `2px solid ${ACCENT}` : "none",
                        outlineOffset: active ? -1 : 0,
                        borderRadius: 16,
                        padding: "13px 15px",
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 10,
                        alignItems: "center",
                        color: c.text,
                        fontFamily: "inherit",
                        boxShadow: active ? `inset 0 1px 0 ${c.inner}` : "none",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.label}
                        </div>
                        <div style={{ ...mono, color: c.muted, marginTop: 3, textTransform: "none", letterSpacing: 0, fontSize: 11, whiteSpace: "normal", lineHeight: 1.4 }}>
                          {s.description}
                        </div>
                      </div>
                      <Pill c={c} tone={active ? "accent" : "ghost"}>
                        <span style={{ ...num, fontSize: 12, fontWeight: 600 }}>{s.count}</span>
                      </Pill>
                    </button>
                  );
                })}
              </div>
            </Glass>

            {/* Membres du segment sélectionné */}
            {selectedKey && (
              <Glass c={c} dark={dark} pad={0}>
                <div style={{ padding: "16px 20px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, borderBottom: `1px solid ${c.line}` }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ ...mono, color: c.muted }}>Membres</div>
                    <div style={{ ...num, fontSize: 18, fontWeight: 500, marginTop: 3 }}>
                      {members.length} destinataire{members.length > 1 ? "s" : ""}
                    </div>
                  </div>
                  <GlassButton c={c} onClick={() => void handleExport()}>
                    Exporter
                  </GlassButton>
                </div>
                <div style={{ maxHeight: 360, overflowY: "auto" }}>
                  {members.length === 0 && (
                    <div style={{ ...mono, color: c.faint, padding: "20px", textAlign: "center", textTransform: "none", letterSpacing: 0 }}>
                      Aucun membre dans ce segment.
                    </div>
                  )}
                  {members.map((m, i) => {
                    const who = m.discordUsername || m.name || "—";
                    return (
                      <div
                        key={m.userId}
                        style={{
                          padding: "11px 20px",
                          borderTop: i > 0 ? `1px solid ${c.hairline}` : "none",
                          display: "flex",
                          flexDirection: "column",
                          gap: 3,
                        }}
                      >
                        <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {who}
                        </div>
                        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: m.email ? c.muted : c.faint }}>
                            {m.email ?? "— pas d'e-mail"}
                          </span>
                          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: m.phone ? c.muted : c.faint }}>
                            {m.phone ?? "— pas de tél."}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Glass>
            )}
          </div>

          {/* RIGHT — Composer */}
          <Glass c={c} dark={dark} pad={0}>
            <div style={{ padding: "18px 24px 14px", borderBottom: `1px solid ${c.line}` }}>
              <div style={{ ...mono, color: c.muted }}>Composer</div>
              <div style={{ ...num, fontSize: 22, fontWeight: 500, marginTop: 4 }}>
                {selectedSegment ? (
                  <span>
                    {selectedSegment.label}{" "}
                    <span style={{ color: c.muted, fontSize: 16 }}>· {selectedSegment.count}</span>
                  </span>
                ) : (
                  <span style={{ color: c.faint }}>Sélectionne un segment</span>
                )}
              </div>
            </div>

            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Canal */}
              <Field label="Canal" c={c}>
                <Segmented
                  c={c}
                  value={channel}
                  onChange={(id) => setChannel(id as Channel)}
                  items={[
                    { id: "email", label: (<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Mail size={12} /> Email</span>) },
                    // WhatsApp masqué tant que WHATSAPP_ENABLED est false (en pause).
                    ...(WHATSAPP_ENABLED
                      ? [{ id: "whatsapp", label: (<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><MessageCircle size={12} /> WhatsApp</span>) }]
                      : []),
                  ]}
                />
                {!WHATSAPP_ENABLED && (
                  <div style={{ ...mono, color: c.faint, fontSize: 10.5, marginTop: 8 }}>
                    📵 WhatsApp en pause — campagnes par email uniquement pour le moment.
                  </div>
                )}
              </Field>

              {/* Objet (email only) */}
              {channel === "email" && (
                <Field label="Objet" c={c}>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Objet de l'e-mail…"
                    style={inputStyle(c)}
                  />
                </Field>
              )}

              {/* Corps */}
              <Field label="Corps du message" c={c}>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={isMobile ? 4 : 6}
                  placeholder={"Salut {prenom}, …"}
                  style={{ ...inputStyle(c), resize: "vertical", lineHeight: 1.5, minHeight: 120 }}
                />
                <div style={{ ...mono, color: c.faint, fontSize: 9.5, marginTop: 2 }}>
                  Variables : <span style={{ color: c.muted }}>{"{prenom}"}</span> ·{" "}
                  <span style={{ color: c.muted }}>{"{pseudo}"}</span>
                </div>
              </Field>

              {/* Aperçu */}
              {body.trim() && (
                <div>
                  <div style={{ ...mono, color: c.muted, fontSize: 9.5, marginBottom: 7 }}>
                    Aperçu · {PREVIEW_PRENOM}
                  </div>
                  <div
                    style={{
                      background: dark ? "rgba(50, 22, 12, 0.30)" : "rgba(255, 232, 220, 0.42)",
                      border: `1px solid ${c.line}`,
                      borderRadius: 16,
                      padding: "16px 18px",
                      boxShadow: `inset 0 1px 0 ${c.inner}`,
                    }}
                  >
                    {channel === "email" && subject.trim() && (
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${c.hairline}` }}>
                        {renderPreview(subject)}
                      </div>
                    )}
                    <div style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                      {renderPreview(body)}
                    </div>
                  </div>
                </div>
              )}

              {/* Numéro de test (whatsapp) */}
              {channel === "whatsapp" && (
                <Field label="Numéro pour le test" c={c}>
                  <input
                    value={testNumber}
                    onChange={(e) => setTestNumber(e.target.value)}
                    placeholder="+33 6 12 34 56 78"
                    style={inputStyle(c)}
                  />
                </Field>
              )}
            </div>

            {/* Actions */}
            <div style={{ padding: "16px 24px", borderTop: `1px solid ${c.line}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <GlassButton
                c={c}
                onClick={() => void handleSendTest()}
                disabled={testing || !body.trim()}
                style={{ opacity: testing || !body.trim() ? 0.55 : 1, cursor: testing || !body.trim() ? "default" : "pointer" }}
              >
                {testing ? "Envoi…" : "Envoyer un test"}
              </GlassButton>
              <GlassButton
                c={c}
                kind="solid"
                onClick={() => setConfirmOpen(true)}
                disabled={!canSend}
                style={{ opacity: canSend ? 1 : 0.5, cursor: canSend ? "pointer" : "default" }}
              >
                Envoyer à {reachable} personne{reachable > 1 ? "s" : ""}
              </GlassButton>
            </div>
          </Glass>
        </div>

        {/* Historique */}
        <Glass c={c} dark={dark} pad={0} style={{ marginTop: 16 }}>
          <div style={{ padding: "18px 22px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ ...mono, color: c.muted }}>Historique</div>
              <div style={{ ...num, fontSize: 22, fontWeight: 500, marginTop: 4 }}>
                {(campaigns ?? []).length} campagne{(campaigns ?? []).length > 1 ? "s" : ""}
              </div>
            </div>
          </div>
          <div>
            {campaigns === undefined && (
              <div style={{ padding: "20px 22px", display: "flex", justifyContent: "center" }}>
                <Loader2 className="animate-spin" style={{ color: c.muted }} size={16} />
              </div>
            )}
            {campaigns && campaigns.length === 0 && (
              <div style={{ ...mono, color: c.faint, padding: "24px 22px", textAlign: "center", textTransform: "none", letterSpacing: 0 }}>
                Aucune campagne envoyée pour l&apos;instant.
              </div>
            )}
            {isMobile
              ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 14px 16px" }}>
                  {(campaigns ?? []).map((cmp) => (
                    <div key={cmp._id} style={cardStyle}>
                      {/* Identité : canal + nom de campagne (objet) */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Pill c={c} tone={cmp.channel === "email" ? "ink" : "outline"}>
                          {cmp.channel === "email" ? (
                            <><Mail size={11} /> Email</>
                          ) : (
                            <><MessageCircle size={11} /> WhatsApp</>
                          )}
                        </Pill>
                        <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                          {cmp.subject || <span style={{ color: c.faint }}>(sans objet)</span>}
                        </div>
                      </div>
                      {/* Corps */}
                      <div style={{ fontSize: 12.5, color: c.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {cmp.body}
                      </div>
                      {/* Infos clés en chips : date, segment, taille, statut/canal */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        <span style={chipStyle}>
                          {fmtDateShort(cmp.createdAt)} · {fmtTime(cmp.createdAt)}
                        </span>
                        <span style={chipStyle}>{cmp.segment}</span>
                        <span style={chipStyle}>{cmp.recipientCount} env.</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
              : (campaigns ?? []).map((cmp, i) => (
              <div
                key={cmp._id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "110px minmax(0,1.4fr) minmax(0,2fr) 90px 140px",
                  gap: 14,
                  alignItems: "center",
                  padding: "14px 22px",
                  borderTop: i > 0 ? `1px solid ${c.hairline}` : `1px solid ${c.line}`,
                }}
              >
                <div>
                  <Pill c={c} tone={cmp.channel === "email" ? "ink" : "outline"}>
                    {cmp.channel === "email" ? (
                      <><Mail size={11} /> Email</>
                    ) : (
                      <><MessageCircle size={11} /> WhatsApp</>
                    )}
                  </Pill>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {cmp.subject || (
                    <span style={{ color: c.faint }}>(sans objet)</span>
                  )}
                  <div style={{ ...mono, color: c.muted, marginTop: 2, fontSize: 10, textTransform: "none", letterSpacing: 0 }}>
                    {cmp.segment}
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: c.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {cmp.body}
                </div>
                <div style={{ ...num, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap" }}>
                  {cmp.recipientCount}
                  <span style={{ ...mono, color: c.faint, fontSize: 9, marginLeft: 4 }}>env.</span>
                </div>
                <div style={{ ...mono, color: c.muted, fontSize: 10, whiteSpace: "nowrap", textTransform: "none", letterSpacing: 0 }}>
                  {fmtDateShort(cmp.createdAt)} · {fmtTime(cmp.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </Glass>
      </div>

      {/* Dialog de confirmation */}
      {confirmOpen && selectedSegment && (
        <ConfirmDialog
          c={c}
          dark={dark}
          isMobile={isMobile}
          segmentLabel={selectedSegment.label}
          count={reachable}
          channel={channel}
          sending={sending}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void handleConfirmSend()}
        />
      )}
    </div>
  );
}

// ── Dialog de confirmation (MobileSheet : bottom-sheet mobile / modale desktop) ──
function ConfirmDialog({
  c,
  dark,
  isMobile,
  segmentLabel,
  count,
  channel,
  sending,
  onCancel,
  onConfirm,
}: {
  c: C;
  dark: boolean;
  isMobile: boolean;
  segmentLabel: string;
  count: number;
  channel: Channel;
  sending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Corps partagé desktop / mobile.
  const body = (
    <>
      <div style={{ ...mono, color: c.muted }}>Confirmation · envoi réel</div>
      <div style={{ ...num, fontSize: 26, fontWeight: 500, marginTop: 8, lineHeight: 1.1 }}>
        Envoyer cette campagne&nbsp;?
      </div>
      <div style={{ fontSize: 14, color: c.muted, marginTop: 14, lineHeight: 1.6 }}>
        Tu vas envoyer un message{" "}
        <span style={{ color: c.text, fontWeight: 500 }}>
          {channel === "email" ? "e-mail" : "WhatsApp"}
        </span>{" "}
        à <span style={{ color: ACCENT, fontWeight: 600 }}>{count} personne{count > 1 ? "s" : ""}</span> du segment{" "}
        <span style={{ color: c.text, fontWeight: 500 }}>« {segmentLabel} »</span>.
      </div>
      <div
        style={{
          ...mono,
          color: c.faint,
          fontSize: 10,
          marginTop: 14,
          textTransform: "none",
          letterSpacing: 0,
          padding: "10px 12px",
          borderRadius: 12,
          background: c.chip,
          border: `1px solid ${c.line}`,
        }}
      >
        Cette action est définitive et envoie de vrais messages.
      </div>
    </>
  );

  if (isMobile) {
    return (
      <MobileSheet
        c={c}
        dark={dark}
        isMobile={isMobile}
        onClose={onCancel}
        title="Confirmer l'envoi"
        maxWidth={420}
        footer={
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
            <GlassButton c={c} onClick={onCancel} style={{ flex: 1 }}>
              Annuler
            </GlassButton>
            <GlassButton
              c={c}
              kind="solid"
              onClick={onConfirm}
              disabled={sending}
              style={{ flex: 1, opacity: sending ? 0.6 : 1, cursor: sending ? "default" : "pointer" }}
            >
              {sending ? "Envoi…" : `Envoyer (${count})`}
            </GlassButton>
          </div>
        }
      >
        {body}
      </MobileSheet>
    );
  }

  // Desktop : modale de confirmation d'origine (verbatim, avant migration MobileSheet).
  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: dark ? "rgba(4,4,8,0.62)" : "rgba(20,16,8,0.34)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confirmer l'envoi"
        style={{
          width: "100%",
          maxWidth: "min(420px, calc(100vw - 32px))",
          background: c.glassStrong,
          backgroundImage: c.sheen,
          backgroundBlendMode: dark ? "plus-lighter" : "normal",
          backdropFilter: "blur(40px) saturate(150%)",
          WebkitBackdropFilter: "blur(40px) saturate(150%)",
          borderRadius: 22,
          border: `1px solid ${c.line}`,
          boxShadow: `inset 0 1px 0 ${c.inner}, ${c.shadow}`,
          color: c.text,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "24px 26px 18px" }}>
          {body}
        </div>
        <div style={{ padding: "16px 26px", borderTop: `1px solid ${c.line}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <GlassButton c={c} onClick={onCancel}>
            Annuler
          </GlassButton>
          <GlassButton
            c={c}
            kind="solid"
            onClick={onConfirm}
            disabled={sending}
            style={{ opacity: sending ? 0.6 : 1, cursor: sending ? "default" : "pointer" }}
          >
            {sending ? "Envoi…" : `Envoyer (${count})`}
          </GlassButton>
        </div>
      </div>
    </div>
  );
}

// ── Sous-composants de formulaire (cohérents rdv-dialog) ─────────────────────
function Field({ label, c, children }: { label: string; c: C; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <span style={{ ...mono, color: c.muted, fontSize: 9.5 }}>{label}</span>
      {children}
    </label>
  );
}

function inputStyle(c: C): CSSProperties {
  return {
    background: c.chip,
    border: `1px solid ${c.line}`,
    borderRadius: 12,
    padding: "11px 13px",
    color: c.text,
    outline: "none",
    fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
    fontSize: 14,
    width: "100%",
    boxSizing: "border-box",
    colorScheme: c.dark ? "dark" : "light",
  };
}
