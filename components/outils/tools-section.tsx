"use client";

import * as React from "react";
import { Id } from "@/convex/_generated/dataModel";
import { Download, FileText, Layers } from "lucide-react";

type Tool = {
  _id: Id<"tools">;
  title: string;
  description: string;
  fileUrl: string;
  category?: string;
  iconName?: string;
};

export function ToolsSection({ tools }: { tools: Tool[] }) {
  if (tools.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 border border-dashed border-foreground/15 bg-foreground/[0.02] py-16 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-foreground/[0.05] text-foreground/50">
          <Layers size={24} />
        </div>
        <div>
          <p
            className="mb-2 font-mono text-[10px] uppercase tracking-[2px] text-foreground/50"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            ◦ Bibliothèque en construction
          </p>
          <h3
            className="mb-2 text-2xl italic leading-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Templates et ressources <em>arrivent bientôt.</em>
          </h3>
          <p
            className="mx-auto max-w-md font-mono text-[11px] text-foreground/55"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            Cheat-sheets, guides PDF, templates de scripts… tout ce dont tu as
            besoin pour booster ta pratique, en téléchargement direct.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => (
        <a
          key={tool._id as string}
          href={tool.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex flex-col border border-foreground/15 bg-foreground/[0.02] p-5 transition-all hover:border-foreground/35 hover:bg-foreground/[0.05]"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <div
              className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[2px] text-foreground/60"
              style={{ fontFamily: "var(--font-body-legacy)" }}
            >
              <FileText size={10} />
              {tool.category ?? "Ressource"}
            </div>
            <Download
              size={14}
              className="text-foreground/30 transition-colors group-hover:text-foreground/80"
            />
          </div>
          <h3
            className="mb-1 text-xl italic leading-tight"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {tool.title}
          </h3>
          <p
            className="font-mono text-[11px] leading-relaxed text-foreground/65"
            style={{ fontFamily: "var(--font-body-legacy)" }}
          >
            {tool.description}
          </p>
        </a>
      ))}
    </div>
  );
}
