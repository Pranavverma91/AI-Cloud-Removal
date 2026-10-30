"use client";
import { startAnalysis } from "@/lib/personal/runner";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type * as GeoJSON from "geojson";
import { UploadCloud } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { api, number, useResource } from "@/lib/science/client";
import type { Raster, Model, Analysis } from "@/lib/science/types";
import {
  analysisPrefill,
  compatibleLissReference,
} from "@/lib/analysis-prefill";
import {
  acquisitionDay,
  isLissIv,
  otherDateLissImages,
} from "@/lib/liss-imagery";
import { Title, Failure, Notice, SelectBox } from "./primitives";
export default function UploadAnalysis() {
  const search = useSearchParams();
  return <UploadAnalysisForm key={search.toString()} search={search} />;
}
function UploadAnalysisForm({
  search,
}: {
  search: Pick<URLSearchParams, "get">;
}) {
  const router = useRouter(),
    images = useResource<Raster[]>("/images"),
    models = useResource<Model[]>("/models"),
    health = useResource<{ service?: string }>("/health"),
    areas =
      useResource<{ id: string; name: string; geojson: GeoJSON.Polygon }[]>(
        "/aoi",
      );
  const prefill = analysisPrefill(search, images.data || []);
  const [sourceOverride, setSelected] = useState<string | null>(null),
    [modelOverride, setModel] = useState<string | null>(search.get("model")),
    [role, setRole] = useState(
      search.get("role") === "temporal" ? "temporal" : "cloudy",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [shadows, setShadows] = useState(true),
    [area, setArea] = useState("none"),
    [relation, setRelation] = useState("none"),
    [auxOverrides, setAux] = useState<Record<string, string>>({
      mask: "none",
      reference: "none",
      temporal: "",
      sentinel1: "none",
    });
  const selected = sourceOverride ?? prefill.sourceId;
  const chosen = images.data?.find((i) => i.id === selected);
  const requestedTemporal = auxOverrides.temporal || prefill.temporalId;
  const validTemporal =
    !prefill.liss ||
    (chosen &&
      otherDateLissImages(images.data || [], chosen).some(
        (i) => i.id === requestedTemporal && compatibleLissReference(chosen, i),
      ));
  const aux: Record<string, string> = {
    ...auxOverrides,
    temporal: validTemporal ? requestedTemporal : "none",
  };
  const model =
    modelOverride ??
    (aux.temporal === "none" ? "spatial-baseline" : "temporal-baseline");
  const personal = health.data?.service === "Built-in personal processor";
  const chosenModel = models.data?.find((m) => m.id === model),
    temporal = images.data?.find((i) => i.id === aux.temporal);
  const bandNames =
    role === "sentinel1"
      ? ["vv", "vh"]
      : role === "mask"
        ? ["mask"]
        : role === "dem"
          ? ["elevation"]
          : ["green", "red", "nir"];
  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const formElement = e.currentTarget,
      form = new FormData(formElement),
      bands: Record<string, number> = {};
    for (const name of bandNames) {
      bands[name] = Number(form.get(name));
      form.delete(name);
    }
    form.set("bands", JSON.stringify(bands));
    form.set("role", role);
    try {
      const image = await api<Raster>("/images", {
        method: "POST",
        body: form,
      });
      await images.refresh();
      if (["cloudy", "synthetic"].includes(role)) setSelected(image.id);
      else {
        setAux((a) => ({
          ...a,
          [role === "clear" ? "reference" : role]: image.id,
        }));
        if (role === "temporal") setModel("temporal-baseline");
      }
      formElement.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }
  async function run(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const result = await api<Analysis>("/analyses", {
        method: "POST",
        body: JSON.stringify({
          name: f.get("name"),
          image_id: selected,
          model_id: model,
          ...Object.fromEntries(
            Object.entries(aux).map(([key, value]) => [
              key + "_id",
              value === "none" ? null : value,
            ]),
          ),
          reference_relation: aux.reference === "none" ? "none" : relation,
          aoi: areas.data?.find((a) => a.id === area)?.geojson || null,
          patch_size: personal ? 256 : Number(f.get("patch_size")),
          overlap: personal ? 32 : Number(f.get("overlap")),
          brightness_threshold: Number(f.get("threshold")),
          detect_shadows: shadows,
          feather: Number(f.get("feather")),
          target_crs: f.get("crs") || null,
          resolution: f.get("resolution") ? Number(f.get("resolution")) : null,
        }),
      });
      if (result.engine === "browser") void startAnalysis(result);
      router.push("/analysis/" + result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to start analysis");
    } finally {
      setBusy(false);
    }
  }
  const optical = (images.data || []).filter(
    (i) => "nir" in i.bands && (!prefill.liss || isLissIv(i)),
  );
  const imageOptions = (items: Raster[]) => [
    { value: "none", label: "None selected" },
    ...items.map((i) => ({ value: i.id, label: i.name })),
  ];
  return (
    <>
      <Title
        title={
          prefill.liss
            ? "Remove clouds from LISS-IV imagery"
            : "New investigation"
        }
        description={
          prefill.liss
            ? "Choose your cloudy acquisition and, if available, a clearer image from another date. Review the inputs before starting reconstruction."
            : "Bring a real observation. Inspect its metadata. Choose an explicit reconstruction method."
        }
      />
      {prefill.liss && (
        <Notice>
          Cloud removal estimates the surface hidden by clouds. It cannot
          recover an actual photograph of the ground at that moment. An image
          from another date is a real acquisition of that date; land cover may
          have changed.
        </Notice>
      )}
      {!images.loading && prefill.missingSource && sourceOverride === null && (
        <Failure message="The linked source observation is unavailable. Upload or choose a valid observation below." />
      )}
      {!images.loading && prefill.invalidTemporal && !auxOverrides.temporal && (
        <Notice>
          The linked other-date image is unavailable or is not a distinct dated
          LISS-IV acquisition with matching sensor and band calibration. Choose
          another compatible dated image to use temporal reconstruction.
        </Notice>
      )}
      {(images.error || models.error || health.error || areas.error) && (
        <Failure
          message={images.error || models.error || health.error || areas.error}
          retry={() => {
            images.refresh();
            models.refresh();
            health.refresh();
            areas.refresh();
          }}
        />
      )}
      {error && <Failure message={error} />}
      <div className="se-two-columns">
        <section className="se-panel">
          <p className="se-eyebrow">01 / INGEST OBSERVATIONS</p>
          <h2>Upload GeoTIFF</h2>
          <form className="se-form" onSubmit={upload}>
            <label className="se-upload">
              <UploadCloud />
              <strong>Choose a georeferenced TIFF</strong>
              <span>CRS required · online: 32 MB / 2 million pixels</span>
              <input name="file" type="file" accept=".tif,.tiff" required />
            </label>
            <div className="se-field-grid">
              <label>
                Image role
                <SelectBox
                  label="Image role"
                  value={role}
                  onChange={setRole}
                  options={[
                    "cloudy",
                    "clear",
                    "mask",
                    "temporal",
                    "sentinel1",
                    "sentinel2",
                    "dem",
                    "synthetic",
                  ].map((value) => ({ value, label: value }))}
                />
              </label>
              <label>
                Sensor
                <input
                  name="sensor"
                  defaultValue="LISS-IV"
                  required
                  maxLength={60}
                />
              </label>
              <label>
                Acquisition date
                <input name="acquired_at" type="date" required={prefill.liss} />
              </label>
            </div>
            <h3>Map the actual band indices</h3>
            <div className="se-field-grid">
              {bandNames.map((name, i) => (
                <label key={name}>
                  {name.toUpperCase()}
                  <input
                    name={name}
                    type="number"
                    min={1}
                    max={16}
                    defaultValue={i + 1}
                    required
                  />
                </label>
              ))}
            </div>
            <p className="se-meta">
              LISS-IV has Green, Red and NIR bands. Its preview uses false color
              NIR/Red/Green. A supplied mask uses 0 clear, 1 cloud and 2 shadow.
            </p>
            <button className="se-button primary" disabled={busy}>
              {busy ? "Working…" : "Upload & inspect"}
            </button>
          </form>
          <hr />
          <label>
            Or choose an uploaded observation
            <SelectBox
              label="Source observation"
              value={selected}
              onChange={setSelected}
              options={imageOptions(optical)}
            />
          </label>
          {chosen && (
            <div className="se-metadata">
              <img
                src={"/api/science/images/" + chosen.id + "/preview"}
                alt="Uploaded false-color observation"
              />
              <dl>
                <dt>Sensor</dt>
                <dd>{chosen.sensor}</dd>
                <dt>Acquisition date</dt>
                <dd>{acquisitionDay(chosen) || "Not recorded"}</dd>
                <dt>Dimensions</dt>
                <dd>
                  {chosen.metadata.width} × {chosen.metadata.height}
                </dd>
                <dt>CRS</dt>
                <dd>{chosen.metadata.crs}</dd>
                <dt>Resolution</dt>
                <dd>
                  {chosen.metadata.resolution
                    .map((v) => number(v, 4))
                    .join(" × ")}{" "}
                  CRS units
                </dd>
                <dt>Bands / type</dt>
                <dd>
                  {chosen.metadata.count} / {chosen.metadata.dtype}
                </dd>
                <dt>NoData</dt>
                <dd>{String(chosen.metadata.nodata ?? "Not specified")}</dd>
                <dt>SHA-256</dt>
                <dd className="se-hash">{chosen.sha256}</dd>
              </dl>
            </div>
          )}
        </section>
        <section className="se-panel">
          <p className="se-eyebrow">02 / DESIGN THE ANALYSIS</p>
          <h2>Processing configuration</h2>
          <form className="se-form" onSubmit={run}>
            <label>
              Investigation name
              <input
                name="name"
                placeholder="Name your investigation"
                required
                maxLength={160}
              />
            </label>
            <label>
              Model
              <SelectBox
                label="Reconstruction model"
                value={model}
                onChange={setModel}
                options={(models.data || []).map((m) => ({
                  value: m.id,
                  label: m.name + (m.available ? "" : " — weights unavailable"),
                  disabled: !m.available,
                }))}
              />
            </label>
            <Notice>
              {chosenModel?.baseline
                ? "This is a non-generative baseline. It estimates missing values from clear spatial or temporal observations."
                : "Learned reconstruction requires a registered, compatible trained checkpoint."}
            </Notice>
            {(["mask", "temporal", "sentinel1", "reference"] as const)
              .filter((key) => !personal || key !== "sentinel1")
              .map((key) => (
                <label key={key}>
                  {key === "sentinel1"
                    ? "Calibrated SAR (VV/VH)"
                    : key === "reference"
                      ? "Evaluation reference"
                      : key === "temporal"
                        ? "Other-date optical image"
                        : "Supplied cloud mask"}
                  {chosenModel?.required_auxiliary.includes(key) &&
                    " · required"}
                  <SelectBox
                    label={key + " imagery"}
                    value={aux[key]}
                    onChange={(value) => {
                      setAux((a) => ({ ...a, [key]: value }));
                      if (
                        prefill.liss &&
                        key === "temporal" &&
                        value !== "none"
                      )
                        setModel("temporal-baseline");
                    }}
                    options={imageOptions(
                      key === "temporal" && prefill.liss
                        ? chosen
                          ? otherDateLissImages(
                              images.data || [],
                              chosen,
                            ).filter((image) =>
                              compatibleLissReference(chosen, image),
                            )
                          : []
                        : (images.data || []).filter((i) =>
                            key === "mask"
                              ? i.role === "mask"
                              : key === "sentinel1"
                                ? "vv" in i.bands
                                : "nir" in i.bands,
                          ),
                    )}
                  />
                </label>
              ))}
            {temporal && (
              <figure className="se-metadata">
                <img
                  src={"/api/science/images/" + temporal.id + "/preview"}
                  alt={`Actual other-date ${temporal.sensor} observation: ${acquisitionDay(temporal) || "date not recorded"}, false colour`}
                />
                <figcaption>
                  <strong>Actual other-date acquisition</strong>
                  <p>
                    {temporal.name} · {temporal.sensor} ·{" "}
                    {acquisitionDay(temporal) || "Date not recorded"}
                  </p>
                  <p className="se-meta">
                    False-colour NIR/Red/Green preview. The processor aligns
                    this input to the cloudy source grid. Replaced pixels remain
                    estimates for the source date. Review this observation for
                    clear coverage first: clouds in the reference are not
                    screened or removed before its pixels are copied.
                  </p>
                </figcaption>
              </figure>
            )}
            {aux.reference !== "none" && (
              <label>
                Reference relationship
                <SelectBox
                  label="Reference relationship"
                  value={relation}
                  onChange={setRelation}
                  options={[
                    { value: "none", label: "Choose the known relationship" },
                    {
                      value: "same-acquisition",
                      label: "Verified same-acquisition reference",
                    },
                    {
                      value: "synthetic-ground-truth",
                      label:
                        "Original clean image from synthetic contamination",
                    },
                    {
                      value: "temporal",
                      label: "Different-date comparison (no accuracy metrics)",
                    },
                  ]}
                />
              </label>
            )}
            <label>
              Study area
              <SelectBox
                label="Study area"
                value={area}
                onChange={setArea}
                options={[
                  { value: "none", label: "Entire source footprint" },
                  ...(areas.data || []).map((a) => ({
                    value: a.id,
                    label: a.name,
                  })),
                ]}
              />
            </label>
            <div className="se-field-grid">
              {!personal && (
                <>
                  <label>
                    Patch size
                    <input
                      name="patch_size"
                      type="number"
                      defaultValue={256}
                      min={256}
                      max={512}
                      step={256}
                    />
                  </label>
                  <label>
                    Patch overlap
                    <input
                      name="overlap"
                      type="number"
                      min={16}
                      max={128}
                      defaultValue={32}
                    />
                  </label>
                </>
              )}
              <label>
                Brightness threshold
                <input
                  name="threshold"
                  type="number"
                  min={0.4}
                  max={0.99}
                  step={0.01}
                  defaultValue={0.75}
                />
              </label>
              {!personal && (
                <label>
                  Mask feathering (px)
                  <input
                    name="feather"
                    type="number"
                    min={0}
                    max={16}
                    defaultValue={0}
                  />
                </label>
              )}
            </div>
            <label className="se-switch-label">
              Detect candidate shadows
              <Switch checked={shadows} onCheckedChange={setShadows} />
            </label>
            {!personal && (
              <details>
                <summary>Output grid options</summary>
                <div className="se-field-grid">
                  <label>
                    Target CRS
                    <input name="crs" placeholder="Keep source CRS" />
                  </label>
                  <label>
                    Resolution in target CRS units
                    <input
                      name="resolution"
                      type="number"
                      min={0.0000001}
                      step="any"
                      placeholder="Keep native resolution"
                    />
                  </label>
                </div>
              </details>
            )}
            {personal && (
              <Notice>
                Processing runs in this browser tab. Keep it open until results
                are saved. The source grid is preserved.
              </Notice>
            )}
            <p className="se-meta">
              Clear pixels are preserved on the processing grid. Reprojection
              resamples the source; reconstructed pixels are estimates.
            </p>
            <button
              className="se-button primary"
              disabled={
                busy ||
                health.loading ||
                !!health.error ||
                selected === "none" ||
                !chosenModel?.available ||
                chosenModel.required_auxiliary.some(
                  (key) => !aux[key] || aux[key] === "none",
                )
              }
            >
              {busy
                ? "Submitting…"
                : prefill.liss
                  ? "Remove clouds & create reconstruction"
                  : "Run reconstruction"}
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
