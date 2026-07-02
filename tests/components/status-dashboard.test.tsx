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
            server_url: { sensitive: false, type: "string", value: "https://server.run.app" }
          }
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

  it("requires explicit destroy confirmation before posting", async () => {
    const user = userEvent.setup();
    render(<StatusDashboard />);

    const button = await screen.findByRole("button", { name: "Destroy" });
    expect(button).toBeDisabled();

    await user.click(screen.getByLabelText("I understand this will run terraform destroy."));
    expect(button).toBeEnabled();

    await user.click(button);

    expect(fetch).toHaveBeenCalledWith(
      "/api/destroy",
      expect.objectContaining({ method: "POST" }),
    );
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
    expect(screen.getByText("Terraform outputs will appear here after plan or apply completes.")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Status dashboard could not be refreshed\. Check the deployment APIs, then try again\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/\/api\/status: Unable to read deployment state\./)).toBeInTheDocument();
    expect(screen.getByText(/\/api\/logs: Unable to read logs\./)).toBeInTheDocument();
    expect(screen.getByText(/\/api\/output: Unable to read outputs\./)).toBeInTheDocument();
  });
});
