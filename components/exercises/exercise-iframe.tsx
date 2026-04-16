"use client";

import { useState, useRef } from "react";
import { Check, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Iframe qui affiche un exercice externe et écoute le postMessage
 * pour auto-compléter quand l'élève génère son PDF.
 */
export function ExerciseIframe({
  url,
  title,
  completed,
  onComplete,
}: {
  url: string;
  title: string;
  completed: boolean;
  onComplete: (rect: DOMRect) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Note : l'écoute postMessage / BroadcastChannel est gérée au niveau de la
  // lesson page (app/lesson/[lessonId]/page.tsx) pour rester active même
  // quand le panneau Exos est fermé. onComplete n'est plus appelé que par
  // le bouton "Valider manuellement" ci-dessous.

  if (completed) {
    return (
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="size-6 rounded-full bg-primary flex items-center justify-center">
            <Check size={14} className="text-primary-foreground" />
          </div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className="text-xs text-primary ml-auto">Complété</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Tu peux revoir cet exercice à tout moment.
        </p>
        <button
          onClick={() => setFullscreen(!fullscreen)}
          className="mt-2 text-xs text-primary hover:underline"
        >
          Revoir l&apos;exercice
        </button>
        {fullscreen && (
          <div className="mt-3">
            <IframeContent
              url={url}
              loaded={loaded}
              setLoaded={setLoaded}
              iframeRef={iframeRef}
              fullscreen={false}
              setFullscreen={setFullscreen}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={fullscreen ? "fixed inset-0 z-50 bg-background p-4" : ""}>
      {/* Header */}
      <div className={`flex items-center justify-between mb-3 ${fullscreen ? "" : ""}`}>
        <h3 className="text-sm font-semibold section-accent">{title}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFullscreen(!fullscreen)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-all"
            title={fullscreen ? "Réduire" : "Plein écran"}
          >
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* Iframe */}
      <IframeContent
        url={url}
        loaded={loaded}
        setLoaded={setLoaded}
        iframeRef={iframeRef}
        fullscreen={fullscreen}
        setFullscreen={setFullscreen}
      />

      {/* Manual complete button */}
      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          L&apos;exercice se valide automatiquement quand tu génères le PDF.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="rounded-full text-xs gap-1.5 shrink-0 active:scale-[0.98]"
          onClick={(e) => onComplete(e.currentTarget.getBoundingClientRect())}
        >
          <Check size={12} /> Valider manuellement
        </Button>
      </div>
    </div>
  );
}

function IframeContent({
  url,
  loaded,
  setLoaded,
  iframeRef,
  fullscreen,
  setFullscreen,
}: {
  url: string;
  loaded: boolean;
  setLoaded: (v: boolean) => void;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  fullscreen: boolean;
  setFullscreen: (v: boolean) => void;
}) {
  return (
    <div className={`relative rounded-xl overflow-hidden border border-border ${fullscreen ? "h-[calc(100vh-120px)]" : "h-[600px]"}`}>
      {/* Loading skeleton */}
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-card">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground">Chargement de l&apos;exercice...</p>
          </div>
        </div>
      )}

      <iframe
        ref={iframeRef}
        src={url}
        onLoad={() => setLoaded(true)}
        className={`w-full h-full border-0 ${loaded ? "opacity-100" : "opacity-0"}`}
        allow="clipboard-write; downloads"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-downloads"
        title="Exercice interactif"
      />

      {/* Fullscreen close */}
      {fullscreen && (
        <button
          onClick={() => setFullscreen(false)}
          className="absolute top-3 right-3 z-10 p-2 rounded-full bg-background/80 backdrop-blur-sm border border-border text-muted-foreground hover:text-foreground transition-all"
        >
          <Minimize2 size={16} />
        </button>
      )}
    </div>
  );
}
