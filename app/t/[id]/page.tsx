import { TripApp } from "@/components/TripApp";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  return <TripApp id={(await params).id} />;
}
