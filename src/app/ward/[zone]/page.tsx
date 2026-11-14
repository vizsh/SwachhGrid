import { notFound } from "next/navigation";
import { WardScorecardClient } from "@/components/ClientOnly";
import { ZONES, ZONE_IDS, type ZoneId } from "@/lib/domain";

export function generateStaticParams() {
  return ZONE_IDS.map((zone) => ({ zone }));
}

export async function generateMetadata({ params }: { params: Promise<{ zone: string }> }) {
  const { zone } = await params;
  const z = ZONES[zone as ZoneId];
  return { title: z ? `${z.name} zone scorecard · SwachhGrid` : "Scorecard · SwachhGrid" };
}

export default async function Page({ params }: { params: Promise<{ zone: string }> }) {
  const { zone } = await params;
  if (!(zone in ZONES)) notFound();
  return <WardScorecardClient zone={zone as ZoneId} />;
}
