import { redirect } from "next/navigation";
import { currentIntroducer } from "./session";
import LoginForm from "./LoginForm";

// PUBLIC page — no Cloudflare Access identity. Reachable once a CF Access
// BYPASS policy exists for /introducer/* and /api/introducer/* (see
// isPublicIntroducerRoute in proxy.ts). Renders standalone: no CRM chrome,
// because the person opening this works for someone else.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Introducer Portal — NextKey Property Strategists",
  robots: { index: false, follow: false },
};

export default async function IntroducerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Already signed in? Skip the form.
  if (await currentIntroducer()) redirect("/introducer/clients");

  const { error } = await searchParams;
  return <LoginForm initialError={error ?? null} />;
}
