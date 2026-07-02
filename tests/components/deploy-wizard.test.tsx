import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeployWizard } from "@/components/deploy/deploy-wizard";

describe("DeployWizard", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          state: {
            phase: "planned",
            activeOperation: null,
            projectId: "gtm-server-deployer",
            region: "asia-southeast1",
            startedAt: "2026-07-02T00:00:00.000Z",
            updatedAt: "2026-07-02T00:01:00.000Z",
            lastSuccessfulPlanAt: "2026-07-02T00:01:00.000Z",
            error: null
          }
        }),
      ),
    );
  });

  it("redacts GTM config in the review step", async () => {
    const user = userEvent.setup();
    render(<DeployWizard />);

    await user.type(screen.getByLabelText("GCP project ID"), "gtm-server-deployer");
    await user.type(screen.getByLabelText("GTM container config"), "secret-config");
    await user.click(screen.getByRole("button", { name: "Review and Plan" }));

    expect(await screen.findByText("[REDACTED]")).toBeInTheDocument();
    expect(screen.queryByText("secret-config")).not.toBeInTheDocument();
  });

  it("keeps Confirm Apply disabled until plan succeeds", () => {
    render(<DeployWizard />);

    expect(screen.getByRole("button", { name: "Confirm Apply" })).toBeDisabled();
  });

  it("posts deployment input to the plan endpoint", async () => {
    const user = userEvent.setup();
    render(<DeployWizard />);

    await user.type(screen.getByLabelText("GCP project ID"), "gtm-server-deployer");
    await user.type(screen.getByLabelText("GTM container config"), "secret-config");
    await user.click(screen.getByRole("button", { name: "Review and Plan" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/deploy/plan",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" }
      }),
    );
    expect(fetch).not.toHaveBeenCalledWith("/api/deploy/apply", expect.anything());
  });

  it("enables apply after a successful plan and starts apply on confirmation", async () => {
    const user = userEvent.setup();
    render(<DeployWizard />);

    await user.type(screen.getByLabelText("GCP project ID"), "gtm-server-deployer");
    await user.type(screen.getByLabelText("GTM container config"), "secret-config");
    await user.click(screen.getByRole("button", { name: "Review and Plan" }));

    const applyButton = await screen.findByRole("button", { name: "Confirm Apply" });
    expect(applyButton).toBeEnabled();

    await user.click(applyButton);

    expect(fetch).toHaveBeenLastCalledWith(
      "/api/deploy/apply",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
