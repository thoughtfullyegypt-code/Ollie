import TableExperience from "@/components/table-experience";
export default function Home() {
  return (
    <TableExperience
      brandName={process.env.NEXT_PUBLIC_BRAND_NAME || "A Seat at the Internet"}
    />
  );
}
