import { MemberShell } from "@/app/_components/member-shell";

// Espace /compte (self-service abonnement) — dans la coquille membre partagée
// (header + nav + gate auth). La page /compte garde sa propre mise en page.
export default function CompteLayout({ children }: { children: React.ReactNode }) {
  return <MemberShell>{children}</MemberShell>;
}
