"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { use, useState } from "react";
import { Loader2, Lock, Check, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  ACCENT,
  palette,
  useIsDark,
  mono,
  num,
  Glass,
  glassBtn,
} from "../../studio/_components/glass";
import { ExerciseRenderer } from "@/components/exercises/exercise-renderer";

// ============================================================================
// /exos/[id] — détail d'un exo.
// Rend ExerciseRenderer (qui dispatche selon config.type : form / table /
// checklist / vision-board). L'auto-save existant (800ms) reste intact.
// Si module non accessible → écran de lock.
// ============================================================================

export default function ExoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const exerciseId = id as Id<"exercises">;
  const dark = useIsDark();
  const c = palette(dark, ACCENT);

  const data = useQuery(api.exercises.getExerciseForUser, { exerciseId });
  const complete = useMutation(api.exerciseResponses.complete);
  const [completing, setCompleting] = useState(false);

  if (data === undefined) {
    return (
      <main style={{ background: c.bgGrad, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="animate-spin" style={{ color: c.muted }} />
      </main>
    );
  }

  if (data === null) {
    return (
      <Shell c={c} dark={dark}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ ...mono, color: ACCENT }}>◦ Exercice introuvable</div>
          <h1 style={{ ...num, fontSize: 30, fontWeight: 500, margin: 0 }}>Ce lien n&apos;est pas valide.</h1>
          <Link href="/exos" style={{ ...glassBtn(c, "ghost"), textDecoration: "none", textAlign: "center" }}>
            ← Retour à mes exos
          </Link>
        </div>
      </Shell>
    );
  }

  if (!data.accessible) {
    return (
      <Shell c={c} dark={dark}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: c.chip, border: `1px solid ${c.line}`, color: c.muted, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Lock size={15} />
            </div>
            <div style={{ ...mono, color: c.muted }}>Module verrouillé</div>
          </div>
          <h1 style={{ ...num, fontSize: 28, fontWeight: 500, lineHeight: 1.1, margin: 0 }}>
            {data.exercise.title}
          </h1>
          <p style={{ fontSize: 14, color: c.muted, lineHeight: 1.55 }}>
            Cet exercice fait partie du{" "}
            <strong style={{ color: c.text }}>Module {data.module.order} — {data.module.title}</strong>.
            Il sera débloqué dès que Walid ou ton avancée l&apos;auront ouvert.
          </p>
          <Link href="/exos" style={{ ...glassBtn(c, "ghost"), textDecoration: "none", textAlign: "center" }}>
            ← Retour à mes exos
          </Link>
        </div>
      </Shell>
    );
  }

  const isCompleted = !!data.response?.completedAt;
  const handleComplete = async () => {
    if (completing) return;
    setCompleting(true);
    try {
      const res = await complete({ exerciseId });
      if (res?.autoUnlocked) {
        toast.success(`Bravo ! Module ${res.autoUnlocked} débloqué 🎉`);
      } else {
        toast.success("Exercice marqué fait.");
      }
    } catch (err) {
      toast.error((err as Error).message ?? "Impossible de valider.");
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div style={{ background: c.bgGrad, minHeight: "100vh", color: c.text, padding: 26, fontFamily: "'Schibsted Grotesk', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Link
            href="/exos"
            style={{ ...mono, fontSize: 10.5, padding: "8px 12px", background: c.chip, border: `1px solid ${c.line}`, color: c.text, borderRadius: 999, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <ArrowLeft size={12} /> Mes exos
          </Link>
          <span style={{ ...mono, color: c.muted, fontSize: 10.5 }}>
            Module {data.module.order} · {data.module.title}
          </span>
        </div>

        {/* Hero exo */}
        <Glass c={c} dark={dark} pad={0} strong style={{ overflow: "hidden", marginBottom: 16 }}>
          <div style={{ padding: "26px 30px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
            <div>
              <div style={{ ...mono, color: c.muted }}>{data.lesson.title}</div>
              <h1 style={{ ...num, fontSize: 30, fontWeight: 500, lineHeight: 1.1, margin: "8px 0 0" }}>
                {data.exercise.title}
              </h1>
            </div>
            {isCompleted ? (
              <span style={{ ...mono, fontSize: 10, padding: "8px 14px", borderRadius: 999, background: "rgba(31,164,99,0.18)", border: "1px solid rgba(31,164,99,0.5)", color: "#1FA463", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Check size={13} /> TERMINÉ
              </span>
            ) : (
              <button
                onClick={() => void handleComplete()}
                disabled={completing}
                style={{ ...glassBtn(c, "solid"), opacity: completing ? 0.6 : 1 }}
              >
                {completing ? "…" : "Marquer fait ✓"}
              </button>
            )}
          </div>
        </Glass>

        {/* Contenu de l'exo (renderer existant) */}
        <Glass c={c} dark={dark}>
          {data.exercise.config ? (
            <ExerciseRenderer
              exerciseId={data.exercise._id}
              config={data.exercise.config}
              title={data.exercise.title}
            />
          ) : data.exercise.exerciseUrl ? (
            <a
              href={data.exercise.exerciseUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...glassBtn(c, "ink"), textDecoration: "none", display: "inline-block" }}
            >
              Ouvrir l&apos;exercice externe ↗
            </a>
          ) : (
            <div style={{ ...mono, color: c.faint }}>
              Aucune configuration pour cet exercice.
            </div>
          )}
        </Glass>
      </div>
    </div>
  );
}

function Shell({ c, dark, children }: { c: ReturnType<typeof palette>; dark: boolean; children: React.ReactNode }) {
  return (
    <main
      style={{
        background: c.bgGrad,
        color: c.text,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
        padding: 24,
      }}
    >
      <Glass c={c} dark={dark} strong pad={0} style={{ width: "100%", maxWidth: 480, overflow: "hidden" }}>
        <div style={{ padding: "32px 28px" }}>{children}</div>
      </Glass>
    </main>
  );
}
