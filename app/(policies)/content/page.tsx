import PolicyShell from "../policy-shell";
const brand = process.env.NEXT_PUBLIC_BRAND_NAME || "A Seat at the Internet";
export const metadata = { title: "Table manners · " + brand };
export default function Content() {
  return (
    <PolicyShell
      title="Odd guests. Good manners."
      intro="Be strange, be kind, and leave a little space for your neighbor."
    >
      <h2>You are welcome to be peculiar</h2>
      <p>
        A dramatic vampire eating garlic bread? An exhausted astronaut? A very
        suspicious detective? Please do. Your guest can be funny, quiet,
        fantastical, or simply you. Neighborhood membership is a choice, never
        an inference about your identity.
      </p>
      <h2>What is not welcome</h2>
      <ul>
        <li>
          Harassment, threats, doxxing, targeted insults, and encouragement of
          violence or self-harm.
        </li>
        <li>
          Hateful or dehumanizing content targeting protected characteristics.
        </li>
        <li>
          Sexual content, sexual exploitation, or content involving the
          sexualization of minors.
        </li>
        <li>
          Impersonation, fraud, scams, misleading promotions, and deceptive
          claims of official affiliation.
        </li>
        <li>
          Malware, phishing, malicious or misleading links, and attempts to
          bypass our safety controls.
        </li>
        <li>
          Other people's private information or content you do not have
          permission to share.
        </li>
      </ul>
      <h2>How review works</h2>
      <p>
        New and edited public content can wait for manual review. While pending,
        your place appears as a neutral reserved seat. Reviewers can approve
        content, hide it, or disable an external link. Any automated checks are
        aids and do not guarantee safety. We keep administrative review
        decisions separate from purchases and receipts.
      </p>
      <h2>Reports and appeals</h2>
      <p>
        Use Report on a guest profile to flag a concern. Do not include
        sensitive information in a report unless necessary. Reports enter a
        private review queue. Owners may use account support to ask about a
        decision or request a review. The operator must define staffing,
        escalation, and response targets before launch.
      </p>
      <h2>Pass the Bread</h2>
      <p>
        Passing bread is a predefined friendly reaction, not a chat message or a
        signal that someone is online. Repeated submissions are deduplicated and
        rate limited. Owners can disable reactions. There is no reaction
        leaderboard.
      </p>
    </PolicyShell>
  );
}
