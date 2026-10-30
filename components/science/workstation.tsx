"use client";
import { running, startAnalysis } from "@/lib/personal/runner";
import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { api, number, useResource } from "@/lib/science/client";
import type { Analysis, Metrics } from "@/lib/science/types";
import {
  Title,
  Failure,
  Loading,
  Notice,
  Badge,
  SelectBox,
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from "./primitives";
import Comparison from "./comparison";
const GeoMap = dynamic(() => import("./geo-map"), { ssr: false });
const stages = [
  "Queued",
  "Preprocessing",
  "Detecting Clouds",
  "Reconstructing",
  "Postprocessing",
  "Evaluating",
  "Completed",
];
export default function Workstation({ id }: { id: string }) {
  const {
      data: a,
      error,
      loading,
      refresh,
    } = useResource<Analysis>("/analyses/" + id, 4000),
    [product, setProduct] = useState("reconstruction"),
    [pixel, setPixel] = useState<{
      longitude: number;
      latitude: number;
      values: Record<string, number[] | null>;
    } | null>(null),
    [pixelError, setPixelError] = useState(""),
    [view, setView] = useState<
      | {
          center: [number, number];
          zoom: number;
          bearing: number;
          pitch: number;
        }
      | undefined
    >();
  async function inspect(point: [number, number]) {
    try {
      setPixel(
        await api(`/analyses/${id}/pixel?lon=${point[0]}&lat=${point[1]}`),
      );
      setPixelError("");
    } catch (e) {
      setPixelError(String(e));
    }
  }
  if (error) return <Failure message={error} retry={refresh} />;
  if (loading || !a) return <Loading />;
  const result = a.result;
  return (
    <>
      <Title
        title={a.name}
        description={`${a.model_id} · ${new Date(a.created_at).toLocaleString()}`}
        action={<Badge>{a.status}</Badge>}
      />
      <div className="se-stage-row">
        {stages.map((s, i) => (
          <span className={stages.indexOf(a.status) >= i ? "done" : ""} key={s}>
            {i + 1}. {s}
          </span>
        ))}
      </div>
      {a.engine === "browser" && a.status !== "Completed" && (
        <Notice>
          Keep this tab open while processing. If you reopened this page, use
          Resume processing to finish saving the outputs.{" "}
          <button
            className="se-button"
            disabled={running(a.id)}
            onClick={() => {
              void startAnalysis(a).then(refresh);
              void refresh();
            }}
          >
            {running(a.id) ? "Processing in this tab…" : "Resume processing"}
          </button>
        </Notice>
      )}
      {a.status === "Failed" ? (
        <Failure message={a.error || "Processing failed"} />
      ) : !result ? (
        <Notice>
          Processing status comes from the worker. This page refreshes
          automatically; no result exists until processing finishes.
        </Notice>
      ) : (
        <>
          <div className="se-stats">
            {[
              ["Original cloud coverage", number(result.cloud_percent) + "%"],
              ["Original shadow coverage", number(result.shadow_percent) + "%"],
              ["Valid area", number(result.area_m2.valid / 1e6) + " km²"],
              ["Processing time", number(result.seconds) + " s"],
            ].map(([label, value]) => (
              <article className="se-panel" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
          <p className="se-meta">
            Coverage is measured in the original observation. The reconstruction
            estimates the masked ground; it is not a new satellite capture.
          </p>
          <Tabs defaultValue="compare">
            <TabsList className="se-tabs">
              <TabsTrigger value="compare">Compare</TabsTrigger>
              <TabsTrigger value="geography">Geographic inspection</TabsTrigger>
              <TabsTrigger value="metrics">Evaluation</TabsTrigger>
              <TabsTrigger value="provenance">Provenance</TabsTrigger>
            </TabsList>
            <TabsContent value="compare">
              <Comparison id={id} />
            </TabsContent>
            <TabsContent value="geography">
              <div className="se-panel">
                <div className="se-panel-heading">
                  <h2>Synchronized geographic views</h2>
                  <SelectBox
                    label="Result product"
                    value={product}
                    onChange={setProduct}
                    options={a.products
                      .filter((p) =>
                        [
                          "reconstruction",
                          "mask",
                          "ndvi",
                          "reference",
                        ].includes(p),
                      )
                      .map((value) => ({ value, label: value }))}
                  />
                </div>
                <div className="se-map-pair">
                  <GeoMap
                    analysisId={id}
                    personal={a.engine === "browser"}
                    product="original"
                    bounds={result.metadata.bounds}
                    onPoint={inspect}
                    view={view}
                    onView={setView}
                  />
                  <GeoMap
                    analysisId={id}
                    personal={a.engine === "browser"}
                    product={product}
                    bounds={result.metadata.bounds}
                    onPoint={inspect}
                    view={view}
                    onView={setView}
                  />
                </div>
                <p className="se-meta">
                  Click a point on either map to read native band values. Pan
                  and zoom are synchronized.
                </p>
              </div>
              <section className="se-panel">
                <h2>Spectral inspection</h2>
                {pixelError && <Failure message={pixelError} />}
                <form
                  className="se-filter-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void inspect([Number(f.get("lon")), Number(f.get("lat"))]);
                  }}
                >
                  <label>
                    Longitude
                    <input
                      name="lon"
                      type="number"
                      step="any"
                      min={-180}
                      max={180}
                      required
                    />
                  </label>
                  <label>
                    Latitude
                    <input
                      name="lat"
                      type="number"
                      step="any"
                      min={-85}
                      max={85}
                      required
                    />
                  </label>
                  <button className="se-button">Inspect pixel</button>
                </form>
                {pixel && (
                  <>
                    <p>
                      {pixel.longitude.toFixed(5)}, {pixel.latitude.toFixed(5)}{" "}
                      · NDVI {number(pixel.values.ndvi?.[0], 4)}
                    </p>
                    {Object.keys(pixel.values).length ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart
                          data={["Green", "Red", "NIR"].map((band, i) => ({
                            band,
                            original: pixel.values.original?.[i],
                            reconstruction: pixel.values.reconstruction?.[i],
                            reference: pixel.values.reference?.[i],
                          }))}
                        >
                          <XAxis dataKey="band" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="original" fill="#687e9e" />
                          <Bar dataKey="reconstruction" fill="#20d8e8" />
                          <Bar dataKey="reference" fill="#77d9a9" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p>No valid raster values at this coordinate.</p>
                    )}
                  </>
                )}
              </section>
            </TabsContent>
            <TabsContent value="metrics">
              <section className="se-panel">
                <h2>Reference-based evaluation</h2>
                <Notice>{result.metric_note}</Notice>
                {result.metrics ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Region</TableHead>
                        {[
                          "Pixels",
                          "MAE",
                          "RMSE",
                          "PSNR",
                          "SSIM",
                          "SAM °",
                          "ERGAS",
                        ].map((k) => (
                          <TableHead key={k}>{k}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(result.metrics).map(([region, m]) => (
                        <TableRow key={region}>
                          <TableCell>{region}</TableCell>
                          {(
                            [
                              "pixels",
                              "mae",
                              "rmse",
                              "psnr",
                              "ssim",
                              "sam",
                              "ergas",
                            ] as (keyof Metrics)[]
                          ).map((k) => (
                            <TableCell key={k}>{number(m?.[k], 4)}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p>
                    Reference unavailable — quantitative reconstruction metrics
                    cannot be calculated.
                  </p>
                )}
                <p className="se-meta">
                  Confidence map unavailable: no calibrated uncertainty model is
                  registered.
                </p>
              </section>
            </TabsContent>
            <TabsContent value="provenance">
              <section className="se-panel">
                <h2>Traceable processing</h2>
                <dl>
                  <dt>CRS</dt>
                  <dd>{result.metadata.crs}</dd>
                  <dt>Processing grid</dt>
                  <dd>
                    {result.metadata.width} × {result.metadata.height}
                  </dd>
                  <dt>Resolution</dt>
                  <dd>{result.metadata.resolution.join(" × ")} CRS units</dd>
                </dl>
                <pre>{JSON.stringify(result.provenance, null, 2)}</pre>
                <h3>Interpretation limits</h3>
                <ul>
                  {result.limitations.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </section>
            </TabsContent>
          </Tabs>
          <section className="se-panel">
            <div className="se-panel-heading">
              <div>
                <p className="se-eyebrow">TAKE THE RESEARCH FURTHER</p>
                <h2>Export products</h2>
              </div>
              <Link href="/analysis/new" className="se-button">
                New investigation
              </Link>
            </div>
            <div className="se-actions">
              {[
                ...a.products.filter(
                  (p) => p !== "score" || a.parameters.mask_id == null,
                ),
                "metadata",
                "report",
              ].map((kind) => (
                <a
                  className="se-button"
                  key={kind}
                  href={`/api/science/analyses/${id}/exports/${kind}`}
                  download
                >
                  {kind}
                </a>
              ))}
            </div>
            <p className="se-meta">
              Reconstruction:{" "}
              {a.engine === "browser" ? "GeoTIFF" : "Cloud Optimized GeoTIFF"}.
              Report: HTML. Metadata: JSON. Downloads include the imagery and
              results saved in this workspace.
            </p>
          </section>
        </>
      )}
    </>
  );
}
