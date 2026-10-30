"use client";
import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CloudOff, ArrowRight, Upload, Layers } from "lucide-react";
import { number, useResource } from "@/lib/science/client";
import type { Dashboard, Analysis } from "@/lib/science/types";
import { LocationSearch, CloudCoverPanel } from "./location-cloud-cover";
import { LissAreaPanel } from "./liss-area-panel";
import {
  Title,
  Failure,
  Loading,
  Empty,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./primitives";
const GeoMap = dynamic(() => import("./geo-map"), { ssr: false });
export function AnalysisTable({ rows }: { rows: Analysis[] }) {
  return rows.length ? (
    <div className="se-table-wrap">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Investigation</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Cloud</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((a) => (
            <TableRow key={a.id}>
              <TableCell>
                <Link className="se-text-link" href={"/analysis/" + a.id}>
                  {a.name}
                </Link>
              </TableCell>
              <TableCell>{a.model_id}</TableCell>
              <TableCell>
                <Badge>{a.status}</Badge>
              </TableCell>
              <TableCell>
                {a.result ? number(a.result.cloud_percent) + "%" : "—"}
              </TableCell>
              <TableCell>
                {new Date(a.created_at).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ) : (
    <Empty title="Your first investigation starts here">
      Upload a georeferenced observation to build your research archive.
    </Empty>
  );
}
export default function DashboardPage() {
  const [point, setPoint] = useState<[number, number] | null>(null);
  const [center, setCenter] = useState<[number, number] | undefined>();
  const [locationName, setLocationName] = useState("");
  const { data, error, loading, refresh } = useResource<Dashboard>(
    "/dashboard",
    15000,
  );
  const latestAnalysis = data?.recent.find(
    (analysis) => analysis.status === "Completed" && analysis.result,
  );
  return (
    <>
      <Title
        title="A clearer view of Earth."
        description="Your observations, processing activity and research results."
        action={
          <Link className="se-button primary" href="/explorer">
            Analyze a location
          </Link>
        }
      />
      {error ? (
        <Failure message={error} retry={refresh} />
      ) : loading || !data ? (
        <Loading />
      ) : (
        <>
          {/* ── Featured: AI Cloud Removal ── */}
          <section className="se-panel se-cr-featured" aria-label="AI Cloud Removal">
            <div className="se-cr-featured-copy">
              <div className="se-cr-featured-icon">
                <CloudOff size={26} style={{ color: "#27d8e8" }} />
              </div>
              <div>
                <p className="se-eyebrow">YOUR CLOUD REMOVAL PROJECT</p>
                <h2>Remove clouds &amp; reconstruct the area</h2>
                <p>
                  Choose any satellite-covered location, let the AI classifier
                  detect cloud and shadow pixels, then run spatial or temporal
                  reconstruction to reveal the surface beneath. Inspect the
                  result, measure NDVI, and export georeferenced GeoTIFFs.
                </p>
                <ol className="se-cr-steps">
                  <li><span>01</span> Choose an area on the map</li>
                  <li><span>02</span> AI detects clouds &amp; shadows</li>
                  <li><span>03</span> Reconstruct masked pixels</li>
                  <li><span>04</span> Analyse &amp; export results</li>
                </ol>
              </div>
            </div>
            <div className="se-cr-featured-actions">
              <Link className="se-button primary se-cr-start-btn" href="/cloud-removal">
                <CloudOff size={16} />
                Start cloud removal
                <ArrowRight size={15} />
              </Link>
              <Link className="se-button" href="/analysis/new">
                <Upload size={15} />
                Upload imagery
              </Link>
              <Link className="se-button" href="/reconstructions">
                <Layers size={15} />
                Past reconstructions
              </Link>
            </div>
          </section>

          <div className="se-stats">
            {[
              ["Uploaded imagery", data.images, "source observations"],
              ["Completed analyses", data.completed, "traceable results"],
              ["In processing", data.processing, "active jobs"],
              [
                "Processed area",
                number(data.processed_area_m2 / 1e6),
                "km² · includes repeated coverage",
              ],
            ].map(([label, value, note]) => (
              <article className="se-panel" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{note}</small>
              </article>
            ))}
          </div>
          <div className="se-dashboard-grid">
            <section className="se-panel">
              <div className="se-panel-heading">
                <h2>Analyze cloud cover on the map</h2>
                <Link href="/explorer">Open cloud map</Link>
              </div>
              <LocationSearch
                onSelect={(value, name) => {
                  setPoint(value);
                  setCenter(value);
                  setLocationName(name);
                }}
              />
              <GeoMap
                analysisId={latestAnalysis?.id}
                bounds={latestAnalysis?.result?.metadata.bounds}
                personal={latestAnalysis?.engine === "browser"}
                center={center}
                selectedPoint={point || undefined}
                onPoint={(value) => {
                  setPoint(value);
                  setLocationName("");
                }}
                height={360}
              />
              {point && (
                <LissAreaPanel point={point} locationName={locationName} />
              )}
              <CloudCoverPanel
                point={point}
                locationName={locationName}
                title={
                  point ? "Current weather estimate" : "Cloud analysis report"
                }
              />
            </section>
            <section className="se-panel">
              <p className="se-eyebrow">PROCESSING INTELLIGENCE</p>
              <h2>Cloud coverage</h2>
              {data.cloud_coverage.length ? (
                <ResponsiveContainer width="100%" height={230}>
                  <AreaChart data={data.cloud_coverage}>
                    <XAxis dataKey="name" hide />
                    <YAxis domain={[0, 100]} unit="%" stroke="#78909f" />
                    <Tooltip
                      contentStyle={{
                        background: "#0d1b2a",
                        border: "1px solid #263d4d",
                      }}
                    />
                    <Area
                      dataKey="percent"
                      name="Cloud pixels"
                      stroke="#27d8e8"
                      fill="#27d8e822"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <Empty title="No coverage measurements">
                  Coverage is calculated from completed cloud masks.
                </Empty>
              )}
              <div className="se-model-summary">
                {data.models.map((m) => (
                  <div key={m.id}>
                    <span>{m.name}</span>
                    <Badge>
                      {m.available ? "Available" : "Weights needed"}
                    </Badge>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <section className="se-panel">
            <div className="se-panel-heading">
              <h2>Recent investigations</h2>
              <Link href="/history">View history</Link>
            </div>
            <AnalysisTable rows={data.recent} />
          </section>
        </>
      )}
    </>
  );
}
