"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, X, Loader2, Check } from "lucide-react";
import { jsPDF } from "jspdf";

import { ExerciseCard } from "./ui/exercise-card";
import { ExerciseInput, ExerciseTextarea } from "./ui/exercise-input";
import { SectionNumber } from "./ui/section-number";
import { GeneratePdfButton } from "./ui/generate-pdf-button";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TimelinePeriod = {
  abonnes: string;
  live: string;
  collab: string;
  revenus: string;
};

type Artist = {
  nom: string;
  admire: string;
};

type Venues = {
  scenes: string;
  medias: string;
  playlists: string;
};

type Lifestyle = {
  revenus: string;
  rythme: string;
  reco: string;
  quotidien: string;
};

type VisionBoardData = {
  timeline: {
    s6: TimelinePeriod;
    s1: TimelinePeriod;
    s3: TimelinePeriod;
  };
  artists: Artist[];
  venues: Venues;
  lifestyle: Lifestyle;
  boussole: string;
};

/* ------------------------------------------------------------------ */
/*  Defaults                                                           */
/* ------------------------------------------------------------------ */

const emptyPeriod = (): TimelinePeriod => ({
  abonnes: "",
  live: "",
  collab: "",
  revenus: "",
});

const emptyArtist = (): Artist => ({ nom: "", admire: "" });

const defaultData = (): VisionBoardData => ({
  timeline: { s6: emptyPeriod(), s1: emptyPeriod(), s3: emptyPeriod() },
  artists: [emptyArtist(), emptyArtist()],
  venues: { scenes: "", medias: "", playlists: "" },
  lifestyle: { revenus: "", rythme: "", reco: "", quotidien: "" },
  boussole: "",
});

/* ------------------------------------------------------------------ */
/*  Progress                                                           */
/* ------------------------------------------------------------------ */

function calcProgress(d: VisionBoardData): number {
  let filled = 0;

  // Section 1 — timeline: any field filled
  const tl = d.timeline;
  const anyTimeline = [tl.s6, tl.s1, tl.s3].some(
    (p) => p.abonnes || p.live || p.collab || p.revenus
  );
  if (anyTimeline) filled++;

  // Section 2 — artists: any artist has a name or admire
  if (d.artists.some((a) => a.nom || a.admire)) filled++;

  // Section 3 — venues
  if (d.venues.scenes || d.venues.medias || d.venues.playlists) filled++;

  // Section 4 — lifestyle
  const ls = d.lifestyle;
  if (ls.revenus || ls.rythme || ls.reco || ls.quotidien) filled++;

  // Section 5 — boussole
  if (d.boussole.trim()) filled++;

  return Math.round((filled / 5) * 100);
}

/* ------------------------------------------------------------------ */
/*  PDF Generation                                                     */
/* ------------------------------------------------------------------ */

async function generatePDF(data: VisionBoardData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const M = 14;

  // Dark header bar
  doc.setFillColor(13, 11, 8);
  doc.rect(0, 0, W, 20, "F");
  doc.setTextColor(240, 233, 219);
  doc.setFontSize(10);
  doc.text("AMOUR STUDIOS\u00AE \u2014 VISION BOARD", M, 13);

  // Red accent line at bottom
  doc.setFillColor(198, 63, 62);
  doc.rect(0, 293, W, 4, "F");

  let y = 30;
  doc.setTextColor(13, 11, 8);

  // Section 1: Timeline
  doc.setFontSize(18);
  doc.text("01 \u2014 O\u00D9 TU VEUX \u00CATRE", M, y);
  y += 10;

  const periods = [
    { label: "6 MOIS", data: data.timeline?.s6 },
    { label: "1 AN", data: data.timeline?.s1 },
    { label: "3 ANS", data: data.timeline?.s3 },
  ];

  for (const period of periods) {
    doc.setFontSize(12);
    doc.setTextColor(198, 63, 62);
    doc.text(period.label, M, y);
    y += 6;
    doc.setTextColor(13, 11, 8);
    doc.setFontSize(9);
    if (period.data) {
      const fields: [string, string][] = [
        ["Abonn\u00E9s", period.data.abonnes],
        ["Lives", period.data.live],
        ["Collabs", period.data.collab],
        ["Revenus", period.data.revenus],
      ];
      for (const [label, val] of fields) {
        if (val) {
          doc.text(`${label}: ${val}`, M + 4, y);
          y += 5;
        }
      }
    }
    y += 4;
  }

  // Section 2: Artists
  if (data.artists?.length) {
    doc.setFontSize(18);
    doc.setTextColor(13, 11, 8);
    doc.text("02 \u2014 TES R\u00C9F\u00C9RENCES", M, y);
    y += 8;
    for (const artist of data.artists) {
      if (artist.nom) {
        doc.setFontSize(11);
        doc.setTextColor(198, 63, 62);
        doc.text(artist.nom, M + 4, y);
        y += 5;
        if (artist.admire) {
          doc.setFontSize(9);
          doc.setTextColor(13, 11, 8);
          const lines = doc.splitTextToSize(artist.admire, W - M * 2 - 8);
          doc.text(lines, M + 4, y);
          y += lines.length * 4.5 + 3;
        }
      }
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    }
    y += 4;
  }

  // Section 3: Venues
  if (data.venues) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(18);
    doc.setTextColor(13, 11, 8);
    doc.text("03 \u2014 O\u00D9 TU VEUX APPARA\u00CETRE", M, y);
    y += 8;
    const venueFields: [string, string][] = [
      ["Sc\u00E8nes", data.venues.scenes],
      ["M\u00E9dias", data.venues.medias],
      ["Playlists", data.venues.playlists],
    ];
    for (const [label, val] of venueFields) {
      if (val) {
        doc.setFontSize(10);
        doc.setTextColor(198, 63, 62);
        doc.text(label, M + 4, y);
        y += 5;
        doc.setFontSize(9);
        doc.setTextColor(13, 11, 8);
        const lines = doc.splitTextToSize(val, W - M * 2 - 8);
        doc.text(lines, M + 4, y);
        y += lines.length * 4.5 + 4;
      }
    }
    y += 4;
  }

  // Section 4: Lifestyle
  if (data.lifestyle) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(18);
    doc.setTextColor(13, 11, 8);
    doc.text("04 \u2014 TON RYTHME DE VIE", M, y);
    y += 8;
    const lifeFields: [string, string][] = [
      ["Revenus", data.lifestyle.revenus],
      ["Rythme", data.lifestyle.rythme],
      ["Reconnaissance", data.lifestyle.reco],
      ["Quotidien", data.lifestyle.quotidien],
    ];
    for (const [label, val] of lifeFields) {
      if (val) {
        doc.setFontSize(10);
        doc.setTextColor(198, 63, 62);
        doc.text(label, M + 4, y);
        y += 5;
        doc.setFontSize(9);
        doc.setTextColor(13, 11, 8);
        const lines = doc.splitTextToSize(val, W - M * 2 - 8);
        doc.text(lines, M + 4, y);
        y += lines.length * 4.5 + 4;
      }
    }
    y += 4;
  }

  // Section 5: Boussole
  if (data.boussole) {
    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(18);
    doc.setTextColor(13, 11, 8);
    doc.text("05 \u2014 TA PHRASE BOUSSOLE", M, y);
    y += 8;
    doc.setFontSize(11);
    doc.setTextColor(198, 63, 62);
    const lines = doc.splitTextToSize(`\u201C${data.boussole}\u201D`, W - M * 2);
    doc.text(lines, M, y);
  }

  doc.save("AMOUR_STUDIOS_VisionBoard.pdf");
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function VisionBoard({ exerciseId }: { exerciseId: Id<"exercises"> }) {
  const response = useQuery(api.exerciseResponses.get, { exerciseId });
  const saveResponse = useMutation(api.exerciseResponses.save);

  const [data, setData] = useState<VisionBoardData>(defaultData);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const initialized = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Initialize from saved data
  useEffect(() => {
    if (response?.data && !initialized.current) {
      try {
        const parsed = JSON.parse(response.data) as Partial<VisionBoardData>;
        setData((prev) => ({
          timeline: {
            s6: { ...prev.timeline.s6, ...parsed.timeline?.s6 },
            s1: { ...prev.timeline.s1, ...parsed.timeline?.s1 },
            s3: { ...prev.timeline.s3, ...parsed.timeline?.s3 },
          },
          artists:
            parsed.artists && parsed.artists.length > 0
              ? parsed.artists
              : prev.artists,
          venues: { ...prev.venues, ...parsed.venues },
          lifestyle: { ...prev.lifestyle, ...parsed.lifestyle },
          boussole: parsed.boussole ?? prev.boussole,
        }));
        initialized.current = true;
      } catch {
        /* ignore bad JSON */
      }
    }
  }, [response]);

  const progressPercent = calcProgress(data);

  /* Auto-save -------------------------------------------------------- */

  const autoSave = useCallback(
    (newData: VisionBoardData) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(async () => {
        setSaving(true);
        await saveResponse({
          exerciseId,
          data: JSON.stringify(newData),
          progressPercent: calcProgress(newData),
        });
        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }, 800);
    },
    [exerciseId, saveResponse]
  );

  const update = (updater: (prev: VisionBoardData) => VisionBoardData) => {
    setData((prev) => {
      const next = updater(prev);
      autoSave(next);
      return next;
    });
  };

  /* Timeline helpers ------------------------------------------------- */

  const updateTimeline = (
    key: "s6" | "s1" | "s3",
    field: keyof TimelinePeriod,
    value: string
  ) => {
    update((d) => ({
      ...d,
      timeline: {
        ...d.timeline,
        [key]: { ...d.timeline[key], [field]: value },
      },
    }));
  };

  /* Artist helpers --------------------------------------------------- */

  const updateArtist = (index: number, field: keyof Artist, value: string) => {
    update((d) => ({
      ...d,
      artists: d.artists.map((a, i) =>
        i === index ? { ...a, [field]: value } : a
      ),
    }));
  };

  const addArtist = () => {
    if (data.artists.length >= 8) return;
    update((d) => ({
      ...d,
      artists: [...d.artists, emptyArtist()],
    }));
  };

  const removeArtist = (index: number) => {
    if (data.artists.length <= 1) return;
    update((d) => ({
      ...d,
      artists: d.artists.filter((_, i) => i !== index),
    }));
  };

  /* Venues helpers --------------------------------------------------- */

  const updateVenue = (field: keyof Venues, value: string) => {
    update((d) => ({
      ...d,
      venues: { ...d.venues, [field]: value },
    }));
  };

  /* Lifestyle helpers ------------------------------------------------ */

  const updateLifestyle = (field: keyof Lifestyle, value: string) => {
    update((d) => ({
      ...d,
      lifestyle: { ...d.lifestyle, [field]: value },
    }));
  };

  /* Boussole --------------------------------------------------------- */

  const updateBoussole = (value: string) => {
    update((d) => ({ ...d, boussole: value }));
  };

  /* Render ----------------------------------------------------------- */

  const timelineCards: {
    key: "s6" | "s1" | "s3";
    label: string;
    sub: string;
  }[] = [
    { key: "s6", label: "6 mois", sub: "Court terme" },
    { key: "s1", label: "1 an", sub: "Moyen terme" },
    { key: "s3", label: "3 ans", sub: "Long terme" },
  ];

  const venueCards: { key: keyof Venues; label: string; placeholder: string }[] = [
    {
      key: "scenes",
      label: "Sc\u00E8nes",
      placeholder: "Quels festivals, salles, \u00E9v\u00E9nements\u2026",
    },
    {
      key: "medias",
      label: "M\u00E9dias",
      placeholder: "Quels m\u00E9dias, podcasts, cha\u00EEnes\u2026",
    },
    {
      key: "playlists",
      label: "Playlists",
      placeholder: "Quelles playlists, radios, curations\u2026",
    },
  ];

  const lifestyleCards: {
    key: keyof Lifestyle;
    label: string;
    placeholder: string;
  }[] = [
    {
      key: "revenus",
      label: "Revenus",
      placeholder: "Combien tu veux gagner et comment\u2026",
    },
    {
      key: "rythme",
      label: "Rythme",
      placeholder: "Combien de morceaux, de lives par mois\u2026",
    },
    {
      key: "reco",
      label: "Reconnaissance",
      placeholder: "Quel niveau de notori\u00E9t\u00E9, quel type de reconnaissance\u2026",
    },
    {
      key: "quotidien",
      label: "Quotidien",
      placeholder: "\u00C0 quoi ressemble ta journ\u00E9e id\u00E9ale\u2026",
    },
  ];

  return (
    <div className="space-y-16">
      {/* ── Header ───────────────────────────────────────────── */}
      <header className="text-center space-y-3 pt-4">
        <h1 className="font-display text-5xl sm:text-7xl tracking-tight leading-none uppercase">
          Vision<span className="font-serif-accent text-primary">board</span>
        </h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          D&eacute;finis ta vision artistique. Projette-toi dans l&apos;artiste que tu veux devenir.
        </p>
        {/* Save indicator */}
        <div className="flex items-center justify-center gap-2 h-5">
          {saving && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              Sauvegarde&hellip;
            </span>
          )}
          {saved && (
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <Check size={12} />
              Sauvegard&eacute;
            </span>
          )}
        </div>
      </header>

      {/* ── Section 01: Timeline ─────────────────────────────── */}
      <section>
        <SectionNumber number={1} />
        <h2 className="font-display text-2xl tracking-tight mb-6">
          O&ugrave; tu veux{" "}
          <em className="font-serif-accent text-primary not-italic">&ecirc;tre</em>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
          {timelineCards.map((tc) => (
            <ExerciseCard key={tc.key}>
              <p className="text-[10px] uppercase tracking-[3px] text-muted-foreground/50 mb-1">
                {tc.sub}
              </p>
              <p className="font-display text-xl tracking-tight mb-6">
                {tc.label}
              </p>
              <div className="space-y-5">
                <ExerciseInput
                  label="Abonn&eacute;s"
                  value={data.timeline[tc.key].abonnes}
                  onChange={(v) => updateTimeline(tc.key, "abonnes", v)}
                  placeholder="10k, 50k..."
                />
                <ExerciseInput
                  label="Dates live"
                  value={data.timeline[tc.key].live}
                  onChange={(v) => updateTimeline(tc.key, "live", v)}
                  placeholder="Festivals, salles..."
                />
                <ExerciseInput
                  label="Collaborations"
                  value={data.timeline[tc.key].collab}
                  onChange={(v) => updateTimeline(tc.key, "collab", v)}
                  placeholder="Artistes, producteurs..."
                />
                <ExerciseInput
                  label="Revenus"
                  value={data.timeline[tc.key].revenus}
                  onChange={(v) => updateTimeline(tc.key, "revenus", v)}
                  placeholder="Objectif mensuel..."
                />
              </div>
            </ExerciseCard>
          ))}
        </div>
      </section>

      {/* ── Section 02: Artist References ────────────────────── */}
      <section>
        <SectionNumber number={2} />
        <h2 className="font-display text-2xl tracking-tight mb-6">
          Tes{" "}
          <em className="font-serif-accent text-primary not-italic">
            r&eacute;f&eacute;rences
          </em>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {data.artists.map((artist, i) => (
            <ExerciseCard key={i}>
              {/* Number badge */}
              <span className="absolute top-3 left-4 font-display text-[40px] leading-none text-white/[0.06] select-none">
                {String(i + 1).padStart(2, "0")}
              </span>
              {/* Delete button */}
              {data.artists.length > 1 && (
                <button
                  onClick={() => removeArtist(i)}
                  className="absolute top-4 right-4 w-6 h-6 flex items-center justify-center text-white/20 hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                  aria-label="Supprimer"
                >
                  <X size={14} />
                </button>
              )}
              <div className="space-y-4 pt-6">
                <input
                  type="text"
                  value={artist.nom}
                  onChange={(e) => updateArtist(i, "nom", e.target.value)}
                  placeholder="Nom de l&apos;artiste"
                  className="w-full bg-transparent border-0 border-b border-white/10 pb-2 text-lg font-display tracking-wide outline-none focus:border-primary transition-colors placeholder:text-white/20 placeholder:italic placeholder:text-sm placeholder:font-sans"
                />
                <ExerciseTextarea
                  value={artist.admire}
                  onChange={(v) => updateArtist(i, "admire", v)}
                  placeholder="Qu&apos;est-ce que tu admires chez cet artiste ?"
                  minHeight={80}
                />
              </div>
            </ExerciseCard>
          ))}
        </div>

        {/* Add artist button */}
        {data.artists.length < 8 && (
          <button
            onClick={addArtist}
            className="mt-1 w-full border border-dashed border-white/10 py-5 text-sm text-muted-foreground/60 hover:text-primary hover:border-primary/40 hover:bg-primary/[0.03] transition-all duration-300 flex items-center justify-center gap-2 group"
          >
            <Plus
              size={14}
              className="group-hover:rotate-90 transition-transform duration-300"
            />
            Ajouter une r&eacute;f&eacute;rence
          </button>
        )}
      </section>

      {/* ── Section 03: Venues ───────────────────────────────── */}
      <section>
        <SectionNumber number={3} />
        <h2 className="font-display text-2xl tracking-tight mb-6">
          O&ugrave; tu veux{" "}
          <em className="font-serif-accent text-primary not-italic">
            appara&icirc;tre
          </em>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
          {venueCards.map((vc) => (
            <ExerciseCard key={vc.key}>
              <p className="font-display text-lg tracking-tight mb-4">
                {vc.label}
              </p>
              <ExerciseTextarea
                value={data.venues[vc.key]}
                onChange={(v) => updateVenue(vc.key, v)}
                placeholder={vc.placeholder}
              />
            </ExerciseCard>
          ))}
        </div>
      </section>

      {/* ── Section 04: Lifestyle ────────────────────────────── */}
      <section>
        <SectionNumber number={4} />
        <h2 className="font-display text-2xl tracking-tight mb-6">
          Ton{" "}
          <em className="font-serif-accent text-primary not-italic">rythme</em>{" "}
          de vie
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {lifestyleCards.map((lc) => (
            <ExerciseCard key={lc.key}>
              <p className="font-display text-lg tracking-tight mb-4">
                {lc.label}
              </p>
              <ExerciseTextarea
                value={data.lifestyle[lc.key]}
                onChange={(v) => updateLifestyle(lc.key, v)}
                placeholder={lc.placeholder}
              />
            </ExerciseCard>
          ))}
        </div>
      </section>

      {/* ── Section 05: Boussole ─────────────────────────────── */}
      <section>
        <SectionNumber number={5} />
        <h2 className="font-display text-2xl tracking-tight mb-6">
          Ta phrase{" "}
          <em className="font-serif-accent text-primary not-italic">
            boussole
          </em>
        </h2>
        <div className="bg-[#0D0B08] border-l-2 border-primary p-8 sm:p-12">
          <ExerciseTextarea
            value={data.boussole}
            onChange={updateBoussole}
            placeholder="&Eacute;cris la phrase qui r&eacute;sume ta vision. Celle qui te guide quand tu doutes."
            minHeight={120}
          />
        </div>
      </section>

      {/* ── PDF Button (fixed) ───────────────────────────────── */}
      <GeneratePdfButton
        onClick={() => generatePDF(data)}
        percent={progressPercent}
      />
    </div>
  );
}
