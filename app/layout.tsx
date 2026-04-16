import type { Metadata } from "next";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { ViewModeProvider } from "@/components/providers/view-mode-provider";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body-legacy",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Amour Studios — Formation pour artistes musique",
  description:
    "Maîtrise la création de contenu pour devenir visible en tant qu'artiste musical. Formation vidéo privée et communauté Discord.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html
        lang="fr"
        className={`${dmSans.variable} ${instrumentSerif.variable} h-full`}
        suppressHydrationWarning
      >
        <head>
          <ThemeInitScript />
        </head>
        <body className="min-h-full flex flex-col">
          <ConvexClientProvider>
            <ViewModeProvider>
              <TooltipProvider delay={150}>
                {children}
                <Toaster position="bottom-right" duration={2200} />
              </TooltipProvider>
            </ViewModeProvider>
          </ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}

/**
 * Inline script component to prevent theme flash (FOUC).
 * Content is a hardcoded string literal — no user input, safe from XSS.
 */
function ThemeInitScript() {
  // This is a static, hardcoded script — not user-controlled content.
  // It reads localStorage to set data-theme before first paint.
  const script = [
    "(function(){",
    "try{",
    "var t=localStorage.getItem('amour-theme');",
    "if(t==='dark')document.documentElement.setAttribute('data-theme','dark');",
    "else if(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)",
    "document.documentElement.setAttribute('data-theme','dark');",
    "}catch(e){}",
    "})();",
  ].join("");

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
