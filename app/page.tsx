import { redirect } from "next/navigation";

// Le produit, c'est le dashboard /studio. La racine y mène directement ;
// le middleware (proxy.ts) renvoie vers /studio/login si non connecté.
export default function Home() {
  redirect("/studio");
}
