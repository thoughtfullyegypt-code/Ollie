import AdminPanel from "../../components/admin-panel";

export const metadata = {
  title: "The host’s desk",
  robots: { index: false, follow: false },
};
export default function AdminPage() {
  return (
    <AdminPanel
      brandName={process.env.NEXT_PUBLIC_BRAND_NAME || "A Seat at the Internet"}
    />
  );
}
