import type { Metadata } from "next";
import "./globals.css";
import "./science.css";
export const metadata: Metadata = {
  title: "AI-Based Cloud Removal and Reconstruction",
  description:
    "A research platform for LISS-IV cloud removal, georeferenced reconstruction, spectral evaluation and real Sentinel-2 observations.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
