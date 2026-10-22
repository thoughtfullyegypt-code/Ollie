import Link from "next/link";
import PolicyShell from "../policy-shell";
const brand = process.env.NEXT_PUBLIC_BRAND_NAME || "A Seat at the Internet";
export const metadata = { title: "Support · " + brand };
export default function Support() {
  const email = process.env.SUPPORT_EMAIL;
  return (
    <PolicyShell
      title="Pull up another chair."
      intro="Need a hand with a seat, an invitation, or an order?"
    >
      <h2>Account support</h2>
      <p>
        Sign in to <Link href="/account">your account</Link> to send a support
        request linked to your seats and orders. Include the seat number or
        order reference when relevant. Never send card numbers, login links, or
        private invitation tokens.
      </p>
      <h2>Contact</h2>
      {email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? (
        <p>
          For help, contact <a href={`mailto:${email}`}>{email}</a>.
        </p>
      ) : (
        <p>
          The operator has not configured a public support email yet. Live
          purchases remain disabled until a monitored support contact is
          configured and verified.
        </p>
      )}
      <h2>Payment issues</h2>
      <p>
        A pending payment can take time to confirm. Your order page displays the
        server-confirmed state. Do not purchase the same seats again while a
        payment is processing. If you believe a payment succeeded but no seats
        were assigned, submit a support request so the operator can reconcile it
        with the payment provider.
      </p>
      <h2>Safety and privacy</h2>
      <p>
        To report public content, use the Report action on that guest's profile.
        To request account deletion, use the controls in your account. The
        operator must publish an urgent safety and privacy contact and response
        process before launch.
      </p>
    </PolicyShell>
  );
}
