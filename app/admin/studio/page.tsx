import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import PromoStudio from "@/components/promo-studio";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "The dinner rehearsal",
  robots: { index: false, follow: false },
};
export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ record?: string }>;
}) {
  try {
    await requireAdmin();
  } catch {
    return (
      <main className="error-page" id="main">
        <p className="eyebrow">A REHEARSAL FOR THE HOSTS</p>
        <h1>This studio is for the hosts.</h1>
        <p>
          Sign in with an authorized administrator account to stage a
          demonstration. Staging never changes real seats or orders.
        </p>
        <Link className="btn btn-primary" href="/account">
          Sign in to your account
        </Link>
        <Link href="/">Back to dinner</Link>
      </main>
    );
  }
  const record = (await searchParams).record === "1";
  return (
    <PromoStudio
      recording={record}
      brandName={process.env.NEXT_PUBLIC_BRAND_NAME || "A Seat at the Internet"}
    />
  );
}
