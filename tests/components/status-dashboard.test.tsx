import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StatusDashboard } from "@/components/status/status-dashboard";

describe("StatusDashboard", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url === "/api/status") {
          return Response.json({ state: { phase: "applied", activeOperation: null, error: null } });
        }

        if (url === "/api/logs") {
          return Response.json({ logs: "Terraform complete" });
        }

        if (url === "/api/destroy") {
          return Response.json({ ok: init?.method === "POST" });
        }

        return Response.json({
          outputs: {
            server_url: { sensitive: false, type: "string", value: "https://server.run.app" },
          },
        });
      }),
    );
  });

  it("renders status logs and outputs", async () => {
    render(<StatusDashboard />);

    expect(await screen.findByText("applied")).toBeInTheDocument();
    expect(await screen.findByText("Terraform complete")).toBeInTheDocument();
    expect(await screen.findByText("https://server.run.app")).toBeInTheDocument();
  });

  it("shows remediation and log excerpts for failed deployments", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url === "/api/status") {
          return Response.json({
            state: {
              phase: "failed",
              activeOperation: null,
              error: {
                category: "terraform_failed",
                phase: "failed",
                message: "Terraform apply failed.",
                remediation:
                  "Review the Terraform log excerpt, fix the reported issue, then run the failed step again.",
                logExcerpt: "Error: resource creation timed out\n\nExit code: 1",
              },
            },
          });
        }

        if (url === "/api/logs") {
          return Response.json({ logs: "Terraform complete" });
        }

        return Response.json({
          outputs: {
            server_url: { sensitive: false, type: "string", value: "https://server.run.app" },
          },
        });
      }),
    );

    render(<StatusDashboard />);

    expect(await screen.findByText("Terraform apply failed.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Review the Terraform log excerpt, fix the reported issue, then run the failed step again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/resource creation timed out/)).toBeInTheDocument();
    expect(screen.getByText(/Exit code: 1/)).toBeInTheDocument();
  });

  it("requires explicit destroy confirmation before posting", async () => {
    const user = userEvent.setup();
    render(<StatusDashboard />);

    const button = await screen.findByRole("button", { name: "Destroy" });
    expect(button).toBeDisabled();

    await user.click(screen.getByLabelText("I understand this will run terraform destroy."));
    expect(button).toBeEnabled();

    await user.click(button);

    expect(fetch).toHaveBeenCalledWith("/api/destroy", expect.objectContaining({ method: "POST" }));
  });

  it("shows a retryable error when destroy returns a non-OK response", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url === "/api/status") {
          return Response.json({ state: { phase: "applied", activeOperation: null, error: null } });
        }

        if (url === "/api/logs") {
          return Response.json({ logs: "Terraform complete" });
        }

        if (url === "/api/destroy") {
          return Response.json({ error: "Unable to destroy infrastructure." }, { status: 500 });
        }

        return Response.json({
          outputs: {
            server_url: { sensitive: false, type: "string", value: "https://server.run.app" },
          },
        });
      }),
    );

    render(<StatusDashboard />);

    await user.click(await screen.findByLabelText("I understand this will run terraform destroy."));
    const button = screen.getByRole("button", { name: "Destroy" });
    await user.click(button);

    expect(await screen.findByText("Unable to destroy infrastructure.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Destroy" })).toBeEnabled();
  });

  it("shows a retryable error when destroy throws", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url === "/api/status") {
          return Response.json({ state: { phase: "applied", activeOperation: null, error: null } });
        }

        if (url === "/api/logs") {
          return Response.json({ logs: "Terraform complete" });
        }

        if (url === "/api/destroy" && init?.method === "POST") {
          throw new Error("Destroy request failed.");
        }

        return Response.json({
          outputs: {
            server_url: { sensitive: false, type: "string", value: "https://server.run.app" },
          },
        });
      }),
    );

    render(<StatusDashboard />);

    await user.click(await screen.findByLabelText("I understand this will run terraform destroy."));
    const button = screen.getByRole("button", { name: "Destroy" });
    await user.click(button);

    expect(await screen.findByText("Destroy request failed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Destroy" })).toBeEnabled();
  });

  it("shows safe defaults when status endpoints return errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url === "/api/status") {
          return Response.json({ error: "Unable to read deployment state." }, { status: 500 });
        }

        if (url === "/api/logs") {
          return Response.json({ error: "Unable to read logs." }, { status: 502 });
        }

        if (url === "/api/output") {
          return Response.json({ error: "Unable to read outputs." }, { status: 503 });
        }

        return Response.json({ ok: true });
      }),
    );

    render(<StatusDashboard />);

    expect(await screen.findAllByText("idle")).toHaveLength(2);
    expect(screen.getByText("No logs yet.")).toBeInTheDocument();
    expect(
      screen.getByText("Terraform outputs will appear here after plan or apply completes."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Status dashboard could not be refreshed\. Check the deployment APIs, then try again\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/\/api\/status: Unable to read deployment state\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/\/api\/logs: Unable to read logs\./)).toBeInTheDocument();
    expect(screen.getByText(/\/api\/output: Unable to read outputs\./)).toBeInTheDocument();
  });

  it("refreshes the dashboard when the user clicks Refresh", async () => {
    const user = userEvent.setup();
    let statusCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url === "/api/status") {
          statusCalls += 1;
          return Response.json({
            state: {
              phase: statusCalls > 1 ? "applied" : "planning",
              activeOperation: statusCalls > 1 ? null : "plan",
              error: null,
            },
          });
        }

        if (url === "/api/logs") {
          return Response.json({ logs: statusCalls > 1 ? "Terraform complete" : "Planning..." });
        }

        if (url === "/api/output") {
          return Response.json({
            outputs:
              statusCalls > 1
                ? {
                    server_url: {
                      sensitive: false,
                      type: "string",
                      value: "https://server.run.app",
                    },
                  }
                : {},
          });
        }

        if (url === "/api/destroy") {
          return Response.json({ ok: init?.method === "POST" });
        }

        return Response.json({ ok: true });
      }),
    );

    render(<StatusDashboard />);

    expect(await screen.findByText("planning")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(await screen.findByText("applied")).toBeInTheDocument();
    expect(await screen.findByText("Terraform complete")).toBeInTheDocument();
  });
});
