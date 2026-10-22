import PolicyShell from "../policy-shell";
import { config } from "@/lib/config";
const brand = process.env.NEXT_PUBLIC_BRAND_NAME || "A Seat at the Internet";
export const metadata = { title: "Service terms · " + brand };
export default function Terms() {
  return (
    <PolicyShell
      title="A place at the table."
      intro="What a seat includes, what it means, and what it does not."
    >
      <h2>The service</h2>
      <p>
        A seat purchases a digital customization and display service: an
        identified place at our shared illustrated table, a configurable guest
        and dish, and the account tools described at checkout. A seat is not
        real-world property, an investment, a financial asset, an NFT, or a
        promise of advertising traffic. No resale market is offered.
      </p>
      <h2>Proposed service commitment</h2>
      <p>
        The proposed paid service term is at least {config.serviceMonths} months
        from successful purchase. Seat numbers remain stable during that term.
        No promise of perpetual operation is made. Before accepting live
        payments, the operator must adopt a final term and any closure,
        interruption, and pro-rata refund arrangements, and show those same
        terms at checkout. The development checkout does not create a paid
        service contract.
      </p>
      <h2>Payment and publication are separate</h2>
      <p>
        The complete USD total is shown before checkout. The server determines
        the price. We confirm payment with the payment provider; a checkout
        return page is not proof of payment. Guests may wait in a manual
        moderation queue. A reserved chair can be displayed while public content
        is pending. Content moderation never erases your financial records.
      </p>
      <h2>Shared and invited seats</h2>
      <p>
        A group purchase includes the displayed number of seats. The buyer
        controls unclaimed group seats and can send a private, revocable claim
        invitation. A recipient verifies an account before accepting a paid seat
        and pays nothing more. A courtesy invitation to an unpurchased nearby
        seat requires a separate purchase. Any temporary hold and its expiry are
        shown explicitly; an expired invitation may offer another available
        place before checkout.
      </p>
      <h2>Ownership and content</h2>
      <p>
        You retain any rights you hold in your submitted name and message. You
        permit us to display that content as part of the service and generate
        public sharing images. Our editable illustration components remain part
        of the website design. Do not submit content or links that violate our
        table manners or another person's rights. We may withhold or remove
        public content after review.
      </p>
      <h2>Account deletion</h2>
      <p>
        Request deletion from your account. We hide public profiles and review
        removal of account data and outstanding paid-seat entitlements with you.
        Records required for tax, fraud prevention, disputes, or other lawful
        obligations may be retained separately for a documented retention
        period. Deletion does not automatically create a refund; applicable
        consumer rights still apply.
      </p>
      <h2>Operator decisions still required</h2>
      <p>
        Legal operator name, business address, support email, minimum age,
        eligible countries, governing jurisdiction, tax treatment, any liability
        limits, cancellation rights, retention schedule, and service-closure
        remedies are not yet configured. The operator must supply these details
        and obtain appropriate local review before enabling payments.
      </p>
    </PolicyShell>
  );
}
