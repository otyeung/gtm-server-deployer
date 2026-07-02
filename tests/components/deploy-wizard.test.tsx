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
          planId: "plan-123",
          state: {
            phase: "planned",
            activeOperation: null,
            projectId: "gtm-server-deployer",
            region: "asia-southeast1",
            startedAt: "2026-07-02T00:00:00.000Z",
            updatedAt: "2026-07-02T00:01:00.000Z",
            lastSuccessfulPlanAt: "2026-07-02T00:01:00.000Z",
            lastSuccessfulPlanId: "plan-123",
            error: null,
          },
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

  it("shows HTTPS as always enabled for the MVP", () => {
    render(<DeployWizard />);

    expect(screen.getByRole("checkbox", { name: /Force HTTPS/i })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Force HTTPS/i })).toBeChecked();
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
        headers: { "content-type": "application/json" },
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
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: "plan-123" }),
      }),
    );
  });

  it("keeps Confirm Apply enabled after planning with a trimmed custom domain", async () => {
    const user = userEvent.setup();
    render(<DeployWizard />);

    await user.type(screen.getByLabelText("GCP project ID"), "gtm-server-deployer");
    await user.type(screen.getByLabelText("GTM container config"), "secret-config");
    await user.type(screen.getByLabelText("Custom domain"), "gtm.example.com ");
    await user.click(screen.getByRole("button", { name: "Review and Plan" }));

    expect(await screen.findByRole("button", { name: "Confirm Apply" })).toBeEnabled();
  });

  it("requires a fresh plan after deployment settings change", async () => {
    const user = userEvent.setup();
    render(<DeployWizard />);

    await user.type(screen.getByLabelText("GCP project ID"), "gtm-server-deployer");
    await user.type(screen.getByLabelText("GTM container config"), "secret-config");
    await user.click(screen.getByRole("button", { name: "Review and Plan" }));

    const applyButton = await screen.findByRole("button", { name: "Confirm Apply" });
    expect(applyButton).toBeEnabled();

    await user.type(screen.getByLabelText("Custom domain"), "gtm.example.com");

    expect(screen.getByRole("button", { name: "Confirm Apply" })).toBeDisabled();
    expect(
      screen.getByText(
        "Deployment settings changed after the last successful plan. Run Review and Plan again before applying.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps Confirm Apply disabled when plan returns a failed phase", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({
        planId: null,
        state: {
          phase: "failed",
          activeOperation: null,
          projectId: "gtm-server-deployer",
          region: "asia-southeast1",
          startedAt: "2026-07-02T00:00:00.000Z",
          updatedAt: "2026-07-02T00:01:00.000Z",
          lastSuccessfulPlanAt: null,
          lastSuccessfulPlanId: null,
          error: {
            category: "terraform_failed",
            phase: "failed",
            message: "Terraform plan failed.",
            remediation:
              "Review the Status page logs, fix the Terraform error, and rerun Review and Plan.",
          },
        },
      }),
    );

    const user = userEvent.setup();
    render(<DeployWizard />);

    await user.type(screen.getByLabelText("GCP project ID"), "gtm-server-deployer");
    await user.type(screen.getByLabelText("GTM container config"), "secret-config");
    await user.click(screen.getByRole("button", { name: "Review and Plan" }));

    expect(
      await screen.findByText(
        /review the status page logs, fix the terraform error, and rerun review and plan\./i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Apply" })).toBeDisabled();
  });

  it("surfaces a retry message when plan cannot reach the server and leaves the button usable", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"));

    const user = userEvent.setup();
    render(<DeployWizard />);

    await user.type(screen.getByLabelText("GCP project ID"), "gtm-server-deployer");
    await user.type(screen.getByLabelText("GTM container config"), "secret-config");
    await user.click(screen.getByRole("button", { name: "Review and Plan" }));

    expect(
      await screen.findByText(
        "Unable to reach the plan endpoint. Check your network connection and retry Review and Plan.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review and Plan" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Confirm Apply" })).toBeDisabled();
  });

  it("surfaces a retry message when apply cannot reach the server and leaves Confirm Apply usable", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({
          planId: "plan-123",
          state: {
            phase: "planned",
            activeOperation: null,
            projectId: "gtm-server-deployer",
            region: "asia-southeast1",
            startedAt: "2026-07-02T00:00:00.000Z",
            updatedAt: "2026-07-02T00:01:00.000Z",
            lastSuccessfulPlanAt: "2026-07-02T00:01:00.000Z",
            lastSuccessfulPlanId: "plan-123",
            error: null,
          },
        }),
      )
      .mockRejectedValueOnce(new Error("apply network down"));

    const user = userEvent.setup();
    render(<DeployWizard />);

    await user.type(screen.getByLabelText("GCP project ID"), "gtm-server-deployer");
    await user.type(screen.getByLabelText("GTM container config"), "secret-config");
    await user.click(screen.getByRole("button", { name: "Review and Plan" }));

    const applyButton = await screen.findByRole("button", { name: "Confirm Apply" });
    expect(applyButton).toBeEnabled();

    await user.click(applyButton);

    expect(
      await screen.findByText(
        "Unable to reach the apply endpoint. Check your network connection and retry Confirm Apply.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Apply" })).toBeEnabled();
  });

  it("shows apply failure details when the engine returns a failed state", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        Response.json({
          planId: "plan-123",
          state: {
            phase: "planned",
            activeOperation: null,
            projectId: "gtm-server-deployer",
            region: "asia-southeast1",
            startedAt: "2026-07-02T00:00:00.000Z",
            updatedAt: "2026-07-02T00:01:00.000Z",
            lastSuccessfulPlanAt: "2026-07-02T00:01:00.000Z",
            lastSuccessfulPlanId: "plan-123",
            error: null,
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          state: {
            phase: "failed",
            activeOperation: null,
            projectId: "gtm-server-deployer",
            region: "asia-southeast1",
            startedAt: "2026-07-02T00:00:00.000Z",
            updatedAt: "2026-07-02T00:02:00.000Z",
            lastSuccessfulPlanAt: "2026-07-02T00:01:00.000Z",
            lastSuccessfulPlanId: "plan-123",
            error: {
              category: "terraform_failed",
              phase: "failed",
              message: "Terraform apply failed.",
              remediation:
                "Review the Status page logs, correct the Terraform error, and retry Confirm Apply.",
            },
          },
        }),
      );

    const user = userEvent.setup();
    render(<DeployWizard />);

    await user.type(screen.getByLabelText("GCP project ID"), "gtm-server-deployer");
    await user.type(screen.getByLabelText("GTM container config"), "secret-config");
    await user.click(screen.getByRole("button", { name: "Review and Plan" }));

    const applyButton = await screen.findByRole("button", { name: "Confirm Apply" });
    expect(applyButton).toBeEnabled();

    await user.click(applyButton);

    expect(
      await screen.findByText(
        /terraform apply failed\. review the status page logs, correct the terraform error, and retry confirm apply\./i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Apply started. Open Status for live logs.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm Apply" })).toBeEnabled();
  });
});
