import AccountPanel from "../../components/account-panel";

export const metadata = { title: "Your place at the table" };
export default function AccountPage() {
  return (
    <AccountPanel
      brandName={process.env.NEXT_PUBLIC_BRAND_NAME || "A Seat at the Internet"}
    />
  );
}
