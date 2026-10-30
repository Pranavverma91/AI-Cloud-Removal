"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/science/client";
import { PublicNav, PublicFooter } from "./landing";
import { Failure } from "./primitives";
export default function AuthForm({
  mode,
  returnTo = "/dashboard",
  token,
}: {
  mode: "login" | "signup" | "forgot";
  returnTo?: string;
  token?: string;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const result = await api<{ detail?: string }>(
        "/auth/" + (mode === "forgot" ? (token ? "reset" : "forgot") : mode),
        {
          method: "POST",
          body: JSON.stringify(
            Object.fromEntries([
              ...form.entries(),
              ...(token ? [["token", token]] : []),
            ]),
          ),
        },
      );
      if (mode === "forgot") setMessage(result.detail || "Request complete");
      else
        window.location.href =
          returnTo.startsWith("/") &&
          !returnTo.startsWith("//") &&
          !returnTo.includes("\\")
            ? returnTo
            : "/dashboard";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="se-site">
      <PublicNav />
      <main className="se-auth">
        <section>
          <p className="se-eyebrow">YOUR NEXT DISCOVERY</p>
          <h1>
            {mode === "signup" ? "A whole planet." : "Your world."}
            <br />
            <em>Your perspective.</em>
          </h1>
          <p>A workspace for your imagery, your models and your research.</p>
          <ul>
            <li>Georeferenced observations and traceable results</li>
            <li>Honest evaluation against valid references</li>
            <li>Your own datasets and analysis history</li>
          </ul>
        </section>
        <section className="se-panel">
          <p className="se-eyebrow">
            AI-Based Cloud Removal and Reconstruction RESEARCH ACCOUNT
          </p>
          <h2>
            {mode === "signup"
              ? "Create an account"
              : mode === "forgot"
                ? "Reset password"
                : "Welcome back"}
          </h2>
          {message ? (
            <p role="status">
              {message} <Link href="/login">Sign in</Link>
            </p>
          ) : (
            <form className="se-form" onSubmit={submit}>
              {mode === "signup" && (
                <label>
                  Name
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={100}
                  />
                </label>
              )}
              {!token && (
                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </label>
              )}
              {(mode !== "forgot" || token) && (
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    minLength={10}
                    maxLength={128}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    required
                  />
                  <small>At least 10 characters</small>
                </label>
              )}
              <button className="se-button primary" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : mode === "signup"
                    ? "Create research account"
                    : mode === "forgot"
                      ? "Continue"
                      : "Sign in"}
              </button>
            </form>
          )}
          {error && <Failure message={error} />}
          <p className="se-meta">
            {mode === "login" ? (
              <>
                <Link href="/signup">Create an account</Link> ·{" "}
                <Link href="/forgot-password">Forgot password?</Link>
              </>
            ) : (
              <Link href="/login">Back to sign in</Link>
            )}
          </p>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
