import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/science/client", () => ({ api: request }));
vi.mock("@/components/science/landing", () => ({
  PublicNav: () => null,
  PublicFooter: () => null,
}));
import AuthForm from "@/components/science/auth-form";
test("failed login displays the actual service error", async () => {
  request.mockRejectedValueOnce(new Error("Research service unavailable"));
  render(<AuthForm mode="login" />);
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "a@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/Password/), {
    target: { value: "long-password" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Sign in" }).closest("form")!,
  );
  await waitFor(() =>
    expect(
      screen.getByText("Research service unavailable"),
    ).toBeInTheDocument(),
  );
  expect(screen.getByRole("button", { name: "Sign in" })).not.toBeDisabled();
});
test("reset flow submits the supplied token and shows confirmed response", async () => {
  request.mockResolvedValueOnce({ detail: "Password updated. Sign in again." });
  render(<AuthForm mode="forgot" token="verified-reset-token" />);
  fireEvent.change(screen.getByLabelText(/Password/), {
    target: { value: "replacement-password" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Continue" }).closest("form")!,
  );
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Password updated"),
  );
  const last = request.mock.calls.at(-1)!;
  expect(last[0]).toBe("/auth/reset");
  expect(JSON.parse(last[1].body)).toEqual({
    token: "verified-reset-token",
    password: "replacement-password",
  });
});
