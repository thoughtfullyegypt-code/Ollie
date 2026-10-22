import PolicyShell from "../policy-shell";
import { config } from "@/lib/config";
const brand = process.env.NEXT_PUBLIC_BRAND_NAME || "A Seat at the Internet";
export const metadata = { title: "Refunds · " + brand };
export default function Refunds() {
  return (
    <PolicyShell
      title="Sometimes plans change."
      intro="A clear proposed refund policy, with a real person responsible for each request."
    >
      <h2>Development mode</h2>
      <p>
        No real card is charged in the clearly marked development checkout.
        Development order records and payment outcomes exist to test the
        application. They are not receipts for a real purchase.
      </p>
      <h2>Proposed {config.refundDays}-day refund window</h2>
      <p>
        The proposed launch policy permits a full refund request within{" "}
        {config.refundDays} calendar days of purchase, including after
        customization. Submit the order reference through your account support
        form. The operator must adopt the final policy, response time, and
        digital-service cancellation requirements for supported jurisdictions
        before live purchases are enabled. Any statutory rights take precedence.
      </p>
      <h2>If a payment cannot be fulfilled</h2>
      <p>
        If payment succeeds but the selected seats cannot safely be assigned,
        the order is flagged for support. We will never silently replace your
        seats. The proposed remedy is a full refund or an alternative you
        explicitly accept. An administrator must reconcile the provider
        transaction and complete the remedy through the auditable refund
        process.
      </p>
      <h2>Processing</h2>
      <p>
        Refunds return to the original payment method through the payment
        provider when available. Provider processing and bank arrival times
        vary; the operator must communicate the provider-confirmed outcome and
        avoid promising an unverified deadline. A requested refund is not marked
        complete until the provider confirms it.
      </p>
      <h2>Content and disputes</h2>
      <p>
        A content review is separate from a financial decision. Hidden content
        does not silently remove a paid order. Disputed payments are flagged for
        review, with fulfillment and account access handled according to the
        final service terms and applicable requirements.
      </p>
    </PolicyShell>
  );
}
