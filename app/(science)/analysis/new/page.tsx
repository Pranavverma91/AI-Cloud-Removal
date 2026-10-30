import Component from "@/components/science/upload-analysis";
import { Suspense } from "react";
export default function Page() {
  return (
    <Suspense fallback={<p role="status">Loading observations…</p>}>
      <Component />
    </Suspense>
  );
}
