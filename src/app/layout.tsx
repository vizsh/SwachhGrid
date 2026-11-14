import type { Metadata, Viewport } from "next";
import { Mukta, Teko, Yatra_One } from "next/font/google";
import "./globals.css";

const yatra = Yatra_One({ variable: "--font-yatra", weight: "400", subsets: ["devanagari", "latin"] });
const teko = Teko({ variable: "--font-teko", weight: ["400", "500", "600"], subsets: ["devanagari", "latin"] });
const mukta = Mukta({ variable: "--font-mukta", weight: ["400", "500", "700", "800"], subsets: ["devanagari", "latin"] });

export const metadata: Metadata = {
  title: "SwachhGrid · Nagpur sanitation tracker",
  description: "Live sanitation reporting and monitoring for Nagpur Municipal Corporation zones.",
};

export const viewport: Viewport = { themeColor: "#F2B705" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${yatra.variable} ${teko.variable} ${mukta.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
