import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="flex flex-col items-center gap-8 text-center max-w-2xl">
        <Badge
          variant="outline"
          className="gap-2 border-brand/40 text-brand bg-brand/5"
        >
          <Sparkles className="size-3.5" />
          Formation Amour Studios
        </Badge>

        <h1 className="text-balance bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent">
          Amour Studios
        </h1>

        <p className="text-lg text-muted-foreground text-balance leading-relaxed">
          La formation qui aide les artistes musicaux à maîtriser la création
          de contenu pour devenir visibles. Communauté privée, contenu
          exclusif, accompagnement sur-mesure.
        </p>

        <div className="flex items-center gap-3">
          <Link
            href="https://www.amourstudios.fr"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ size: "lg" }), "glow-hover")}
          >
            Rejoindre la formation
          </Link>
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
          >
            Se connecter
          </Link>
        </div>

        <p className="text-xs text-muted-foreground mt-8">
          Accès exclusif via Discord — la connexion utilise Discord OAuth.
        </p>
      </div>
    </main>
  );
}
