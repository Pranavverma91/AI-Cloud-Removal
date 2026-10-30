"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Menu,
  X,
  ScanLine,
  Layers,
  Orbit,
  Map,
  ChartNoAxesCombined,
  Download,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "./primitives";
export function PublicNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="se-public-nav">
      <Brand />
      <button
        className="se-menu"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
      >
        {open ? <X /> : <Menu />}
      </button>
      <nav className={open ? "is-open" : ""}>
        <Link onClick={() => setOpen(false)} href="/#technology">
          Technology
        </Link>
        <Link onClick={() => setOpen(false)} href="/#workflow">
          How it works
        </Link>
        <Link href="/applications">Applications</Link>
        <Link href="/research">Research</Link>
      </nav>
      <Link className="se-button" href="/dashboard">
        Open workspace
      </Link>
    </header>
  );
}
export function PublicFooter() {
  return (
    <footer className="se-public-footer">
      <Brand />
      <p>
        AI-Based Cloud Removal and Reconstruction
        <br />
        Personal satellite imagery workspace
      </p>
      <div>
        <Link href="/research">Research & methodology</Link>
        <Link href="/applications">Applications</Link>
        <Link href="/workspace">Sentinel-2 workspace</Link>
      </div>
      <small>
        Cloud artwork is illustrative.
        <br />
        Reconstruction is an estimate. Validation makes the difference.
      </small>
    </footer>
  );
}
export default function Landing() {
  return (
    <div className="se-site">
      <PublicNav />
      <main>
        <section className="se-hero">
          <div className="se-hero-copy">
            <p className="se-eyebrow">EARTH OBSERVATION. REIMAGINED.</p>
            <h1>
              SEE BEYOND
              <br />
              THE <em>CLOUDS.</em>
            </h1>
            <p>
              Your personal workspace for
              <br className="se-desktop" /> cloud removal and satellite image
              reconstruction.
            </p>
            <div className="se-actions">
              <Link className="se-button primary" href="/analysis/new">
                Start a reconstruction
              </Link>
              <a className="se-button" href="#technology">
                Explore Technology
              </a>
            </div>
            <small>Built-in processing. Your imagery. Your results.</small>
          </div>
          <div className="se-clouds" aria-hidden="true">
            <picture>
              <source
                media="(max-width: 800px)"
                srcSet="/space/home-clouds-mobile.webp"
              />
              <img
                src="/space/home-clouds.webp"
                alt=""
                width={1672}
                height={941}
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
            </picture>
          </div>
          <div className="se-hero-notes">
            <span>PERSONAL CLOUD RECONSTRUCTION</span>
            <span>ILLUSTRATIVE CLOUDSCAPE</span>
          </div>
        </section>
        <section className="se-tech-strip">
          <article>
            <ScanLine />
            <div>
              <p className="se-eyebrow">LISS-IV</p>
              <h3>5.8 m Earth Observation</h3>
              <p>
                Green, red and near-infrared. High-resolution Indian Earth
                observation.
              </p>
            </div>
          </article>
          <article>
            <Layers />
            <div>
              <p className="se-eyebrow">MULTI-SENSOR</p>
              <h3>SAR + Optical Fusion</h3>
              <p>
                Complementary observations with explicit alignment and
                provenance.
              </p>
            </div>
          </article>
          <article>
            <Orbit />
            <div>
              <p className="se-eyebrow">GENERATIVE AI</p>
              <h3>Surface Reconstruction</h3>
              <p>
                Spatial and temporal baselines run now. Neural models require
                trained weights.
              </p>
            </div>
          </article>
        </section>
        <section id="technology" className="se-public-section se-two">
          <div>
            <p className="se-eyebrow">THE CHALLENGE / THE POSSIBILITY</p>
            <h2>
              Clouds obscure the surface.
              <br />
              <em>Insight shouldn’t stop there.</em>
            </h2>
          </div>
          <div>
            <p>
              Cloud contamination interrupts optical satellite observations,
              hiding the information needed to understand a changing planet.
            </p>
            <p>
              AI-Based Cloud Removal and Reconstruction connects detection,
              reconstruction and scientific evaluation. Every output stays
              linked to its source imagery, model and processing decisions.
            </p>
            <Link className="se-text-link" href="/research">
              Discover the research
            </Link>
          </div>
        </section>
        <section id="workflow" className="se-public-section">
          <p className="se-eyebrow">FROM OBSERVATION TO UNDERSTANDING</p>
          <h2>
            A clear path through
            <br />
            <em>complex imagery.</em>
          </h2>
          <div className="se-workflow">
            {[
              [
                "Bring your observations",
                "Upload georeferenced imagery and inspect its actual bands, extent and resolution.",
              ],
              [
                "Identify the obstruction",
                "Detect cloud and shadow or supply a class mask. Define which pixels to reconstruct.",
              ],
              [
                "Reconstruct the surface",
                "Run built-in spatial or temporal reconstruction while preserving clear observations.",
              ],
              [
                "Evaluate. Inspect. Export.",
                "Compare valid references, inspect spectral values and export georeferenced products.",
              ],
            ].map(([title, text], i) => (
              <article key={title}>
                <span>0{i + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="se-public-section se-feature-section">
          <div>
            <p className="se-eyebrow">THE FULL PICTURE</p>
            <h2>
              Down to
              <br />
              <em>the pixel.</em>
            </h2>
            <p>
              Move from a geographic overview to spectral values without losing
              the scientific context.
            </p>
            <Link className="se-button" href="/dashboard">
              Open the workspace
            </Link>
          </div>
          <div className="se-feature-grid">
            {[
              [
                Map,
                "Geographic context",
                "Real coordinates, study areas and registered raster layers.",
              ],
              [
                ChartNoAxesCombined,
                "Spectral inspection",
                "Green, red, NIR and NDVI read from your imagery.",
              ],
              [
                Layers,
                "Controlled comparison",
                "Shared display stretch and explicit reference provenance.",
              ],
              [
                ShieldCheck,
                "Honest evaluation",
                "Reference-only metrics. Missing measurements remain unavailable.",
              ],
            ].map(([Icon, title, text]) => {
              const I = Icon as typeof Map;
              return (
                <article key={String(title)}>
                  <I />
                  <h3>{String(title)}</h3>
                  <p>{String(text)}</p>
                </article>
              );
            })}
          </div>
        </section>
        <section className="se-public-section">
          <p className="se-eyebrow">AI ARCHITECTURE</p>
          <h2>
            Multiple models.
            <br />
            <em>One scientific standard.</em>
          </h2>
          <p>
            Interpolation baselines, residual networks, conditional GANs and
            diffusion.
            <br />
            Learned reconstruction requires compatible trained checkpoints.
          </p>
          <div className="se-architecture">
            {[
              "Optical observation",
              "Cloud & shadow mask",
              "Conditional reconstruction",
              "Traceable surface estimate",
            ].map((t, i) => (
              <div key={t}>
                <small>0{i + 1}</small>
                <h3>{t}</h3>
              </div>
            ))}
          </div>
          <p className="se-meta">
            Optional conditioning: aligned temporal optical imagery + calibrated
            SAR
          </p>
        </section>
        <section className="se-public-section">
          <p className="se-eyebrow">EARTH OBSERVATION, APPLIED</p>
          <h2>
            See change.
            <br />
            <em>Support better decisions.</em>
          </h2>
          <div className="se-application-grid">
            {[
              [
                "01 / AGRICULTURE",
                "Monitor growing landscapes",
                "Explore vegetation and canopy patterns while keeping reconstruction uncertainty in view.",
              ],
              [
                "02 / WATER & DISASTERS",
                "Understand a changing surface",
                "Support retrospective investigation with complementary optical and radar observations.",
              ],
              [
                "03 / ENVIRONMENT",
                "Follow the bigger picture",
                "Study forests, land cover and infrastructure across aligned acquisitions.",
              ],
            ].map(([label, title, text]) => (
              <article key={label}>
                <p className="se-eyebrow">{label}</p>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <Link className="se-text-link" href="/applications">
            Explore applications
          </Link>
        </section>
        <section className="se-research-cta">
          <Download />
          <p className="se-eyebrow">RESEARCH, WITH A CLEAR LINE OF SIGHT</p>
          <h2>
            Make the unseen
            <br />
            <em>worth investigating.</em>
          </h2>
          <p>
            Reconstructed imagery is an estimate. Transparent methods,
            <br />
            real measurements and reproducible experiments come first.
          </p>
          <Link className="se-button primary" href="/dashboard">
            Start your investigation
          </Link>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
