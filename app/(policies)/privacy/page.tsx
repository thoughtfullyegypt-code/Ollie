import PolicyShell from "../policy-shell";
const brand = process.env.NEXT_PUBLIC_BRAND_NAME || "A Seat at the Internet";
export const metadata = { title: "Privacy · " + brand };
export default function Privacy() {
  return (
    <PolicyShell
      title="A little room for privacy."
      intro="Your public dinner guest and your private account are different things."
    >
      <h2>What is public</h2>
      <p>
        Published profiles show your selected illustration and dish, display
        name, short message, permanent seat number, chosen neighborhood, join
        date, reaction count, and optional website link. Public profile links
        and sharing images can be copied, indexed, or saved by others. Never
        include private information in your public name or message.
      </p>
      <h2>What is private</h2>
      <p>
        Your email address, authentication sessions, payment references, support
        requests, and unclaimed invitation secrets are not included in public
        profiles. Hosted checkout sends card details directly to the payment
        provider. We do not store full card numbers or security codes in this
        application.
      </p>
      <h2>Authentication and service records</h2>
      <p>
        We store an account email and verified sign-in sessions to let you
        manage your seats. A sign-in email provider processes delivery when
        configured. We retain order, seat allocation, payment-event, moderation,
        and administrative audit records to operate the service and investigate
        errors or abuse. Invitation tokens are stored as hashes rather than
        reusable plaintext credentials.
      </p>
      <h2>Cookies and measurement</h2>
      <p>
        Essential session cookies keep you signed in. Browser storage keeps an
        unfinished customization draft and motion preference. This release does
        not enable third-party analytics. If analytics are added, the operator
        must configure an appropriate privacy and consent model before
        collection. Do not record invitation tokens, email links, card details,
        or private support text in analytics.
      </p>
      <h2>Safety and external services</h2>
      <p>
        Rate-limiting identifiers may be derived from visitor network
        information to reduce reaction and reporting abuse. An optional external
        website link takes you to another operator's service. External links are
        validated to HTTP or HTTPS and use protective link attributes, but
        manual review cannot guarantee every destination remains safe.
      </p>
      <h2>Your requests</h2>
      <p>
        Your account provides controls for profile visibility and reactions and
        a support route for access or deletion requests. A deletion request
        hides public content while the operator reviews paid-service
        entitlements and legally required transaction retention. The operator
        must verify the requester's account before acting.
      </p>
      <h2>Required before launch</h2>
      <p>
        The operator must publish its legal identity and contact, processing
        purposes and legal bases where required, processor list, hosting
        location and transfer arrangements, retention periods, rights procedure,
        age policy, and security incident contact. Backup retention and deletion
        schedules must be documented and tested. These details have not been
        invented for this preview.
      </p>
    </PolicyShell>
  );
}
