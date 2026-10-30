import type { Metadata } from "next";
import Component from "@/components/science/cloud-removal-workflow";

export const metadata: Metadata = {
  title: "AI Cloud Removal & Reconstruction — AI-Based Cloud Removal",
  description:
    "Choose a satellite-covered area, detect cloud and shadow pixels with the AI classifier, run spatial or temporal reconstruction, and export georeferenced results.",
  robots: { index: false, follow: false },
};

export default function CloudRemovalPage() {
  return <Component />;
}
