"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { number, useResource } from "@/lib/science/client";
import type {
  Analysis,
  Experiment,
  Model,
  Raster,
  User,
} from "@/lib/science/types";
import { AnalysisTable } from "./dashboard";
import {
  Title,
  Failure,
  Loading,
  Empty,
  Notice,
  Badge,
  SelectBox,
  Table,
  TableHead,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
} from "./primitives";
export function HistoryPage({ completed = false }: { completed?: boolean }) {
  const search = useSearchParams(),
    [query, setQuery] = useState(search.get("q") || ""),
    [status, setStatus] = useState("all"),
    [model, setModel] = useState("all"),
    [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  const data = useResource<Analysis[]>("/analyses", 15000),
    rows = (data.data || []).filter(
      (a) =>
        (!completed || a.status === "Completed") &&
        a.name.toLowerCase().includes(query.toLowerCase()) &&
        (status === "all" || a.status === status) &&
        (model === "all" || a.model_id === model) &&
        (!start || a.created_at.slice(0, 10) >= start) &&
        (!end || a.created_at.slice(0, 10) <= end),
    );
  return (
    <>
      <Title
        title={completed ? "Surface reconstructions" : "Analysis history"}
        description="Your inputs, processing choices and results remain connected."
        action={
          <Link href="/analysis/new" className="se-button primary">
            New analysis
          </Link>
        }
      />
      <section className="se-panel">
        <div className="se-filter-row">
          <label>
            Find investigation
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name…"
            />
          </label>
          <SelectBox
            label="Processing status"
            value={status}
            onChange={setStatus}
            options={[
              "all",
              ...new Set(data.data?.map((a) => a.status) || []),
            ].map((value) => ({
              value,
              label: value === "all" ? "All statuses" : value,
            }))}
          />
          <SelectBox
            label="Model filter"
            value={model}
            onChange={setModel}
            options={[
              "all",
              ...new Set(data.data?.map((a) => a.model_id) || []),
            ].map((value) => ({
              value,
              label: value === "all" ? "All models" : value,
            }))}
          />
          <label>
            From
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        {data.error ? (
          <Failure message={data.error} retry={data.refresh} />
        ) : data.loading ? (
          <Loading />
        ) : (
          <AnalysisTable rows={rows} />
        )}
      </section>
    </>
  );
}
export function DatasetsPage() {
  const data = useResource<Raster[]>("/images");
  return (
    <>
      <Title
        title="Your observation inventory"
        description="Actual uploaded files, band mappings and geospatial metadata."
        action={
          <Link href="/analysis/new" className="se-button primary">
            Upload imagery
          </Link>
        }
      />
      {data.error ? (
        <Failure message={data.error} retry={data.refresh} />
      ) : data.loading ? (
        <Loading />
      ) : !data.data?.length ? (
        <Empty title="No imagery uploaded">
          Upload a licensed observation to start your dataset.
        </Empty>
      ) : (
        <div className="se-card-grid">
          {data.data.map((image) => (
            <article key={image.id} className="se-panel se-dataset">
              <img
                src={"/api/science/images/" + image.id + "/preview"}
                alt={`Preview of ${image.name}`}
                loading="lazy"
              />
              <div>
                <div className="se-panel-heading">
                  <Badge>{image.role}</Badge>
                  <span className="se-meta">
                    {number(image.metadata.bytes / 1048576)} MB
                  </span>
                </div>
                <h3>{image.name}</h3>
                <p>
                  {image.sensor} ·{" "}
                  {image.acquired_at || "Acquisition date unavailable"}
                </p>
                <dl>
                  <dt>Dimensions</dt>
                  <dd>
                    {image.metadata.width} × {image.metadata.height}
                  </dd>
                  <dt>CRS</dt>
                  <dd>{image.metadata.crs}</dd>
                  <dt>Band mapping</dt>
                  <dd>
                    {Object.entries(image.bands)
                      .map(([k, v]) => k + ": " + v)
                      .join(" · ")}
                  </dd>
                  <dt>Patch count</dt>
                  <dd>Not prepared</dd>
                </dl>
                <details>
                  <summary>Integrity & spatial metadata</summary>
                  <pre>
                    {JSON.stringify(
                      { sha256: image.sha256, ...image.metadata },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
export function ModelsPage() {
  const data = useResource<Model[]>("/models");
  return (
    <>
      <Title
        title="Model registry"
        description="Explicit baselines. Versioned neural models. No unmeasured performance claims."
        action={
          <Link className="se-button" href="/models/lab">
            Open laboratory
          </Link>
        }
      />
      {data.error ? (
        <Failure message={data.error} retry={data.refresh} />
      ) : data.loading ? (
        <Loading />
      ) : (
        <div className="se-card-grid">
          {data.data?.map((m) => (
            <article key={m.id} className="se-panel se-model-card">
              <div className="se-model-symbol">{m.baseline ? "B" : "AI"}</div>
              <Badge>{m.available ? "Available" : "Weights unavailable"}</Badge>
              <h2>{m.name}</h2>
              <p>{m.architecture}</p>
              <dl>
                <dt>Version</dt>
                <dd>{m.version}</dd>
                <dt>Conditioning</dt>
                <dd>{m.required_auxiliary.join(" + ") || "Optical + mask"}</dd>
                <dt>Training date</dt>
                <dd>{m.training_date || "Unavailable"}</dd>
              </dl>
              {m.validation_metrics ? (
                <pre>{JSON.stringify(m.validation_metrics, null, 2)}</pre>
              ) : (
                <p className="se-meta">Validation metrics unavailable.</p>
              )}
              {m.available ? (
                <Link
                  className="se-button primary"
                  href={"/analysis/new?model=" + m.id}
                >
                  Use this model
                </Link>
              ) : (
                <Notice>{m.reason}</Notice>
              )}
            </article>
          ))}
        </div>
      )}
      <Notice>
        Baselines are non-generative. Learned architectures require compatible
        weights, domain validation and lawful training data. No checkpoint is
        bundled with this project.
      </Notice>
    </>
  );
}
export function Laboratory({ id }: { id?: string }) {
  const data = useResource<Experiment[]>("/experiments"),
    runs = (data.data || []).filter((r) => !id || r.id === id);
  return (
    <>
      <Title
        title="Model laboratory"
        description="Measured experiment histories imported from completed training runs."
      />
      {data.error ? (
        <Failure message={data.error} retry={data.refresh} />
      ) : data.loading ? (
        <Loading />
      ) : !runs.length ? (
        <Empty title="No experiment results yet">
          Train on a disjoint dataset, then register its measured history and
          checkpoint. No benchmark scores are initialized here.
        </Empty>
      ) : (
        runs.map((run) => (
          <section key={run.id} className="se-panel">
            <div className="se-panel-heading">
              <div>
                <p className="se-eyebrow">{run.model_id}</p>
                <h2>{run.dataset}</h2>
              </div>
              <Badge>{new Date(run.created_at).toLocaleDateString()}</Badge>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={run.history}>
                <XAxis dataKey="epoch" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line dataKey="train_loss" stroke="#29d9e9" dot={false} />
                <Line dataKey="val_loss" stroke="#a394ff" dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    "Epoch",
                    "Training loss",
                    "Validation loss",
                    "Validation MAE",
                    "Seconds",
                  ].map((s) => (
                    <TableHead key={s}>{s}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.history.map((h) => (
                  <TableRow key={h.epoch}>
                    {[
                      h.epoch,
                      h.train_loss,
                      h.val_loss,
                      h.val_mae,
                      h.seconds,
                    ].map((v, i) => (
                      <TableCell key={i}>{number(v, 5)}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <details>
              <summary>Experiment configuration</summary>
              <pre>{JSON.stringify(run.configuration, null, 2)}</pre>
            </details>
          </section>
        ))
      )}
    </>
  );
}
export function SettingsPage({ personalMode }: { personalMode: boolean }) {
  const me = useResource<User>("/auth/me"),
    health = useResource<{ status: string; version: string }>("/health");
  return (
    <>
      <Title
        title="Workspace settings"
        description="Your workspace profile and processor status."
      />
      <div className="se-two-columns">
        <section className="se-panel">
          <h2>Personal profile</h2>
          {me.data ? (
            <dl>
              <dt>Name</dt>
              <dd>{me.data.name}</dd>
              {!personalMode && <><dt>Email</dt>
              <dd>{me.data.email}</dd></>}
              <dt>Workspace ID</dt>
              <dd className="se-hash">{me.data.id}</dd>
            </dl>
          ) : me.error ? (
            <Failure message={me.error} />
          ) : (
            <Loading />
          )}
          {!personalMode && <Link className="se-text-link" href="/forgot-password">
            Password help
          </Link>}
        </section>
        <section className="se-panel">
          <h2>Processing connection</h2>
          {health.data ? (
            <>
              <Badge>{health.data.status}</Badge>
              <p>Service version {health.data.version}</p>
            </>
          ) : health.error ? (
            <Failure message={health.error} retry={health.refresh} />
          ) : (
            <Loading />
          )}
          <p>
            The processing service manages GeoTIFF storage, analysis jobs
            and model execution. Map providers and satellite catalogues are
            separate external services.
          </p>
        </section>
      </div>
    </>
  );
}
