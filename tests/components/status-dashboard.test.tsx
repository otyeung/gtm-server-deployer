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
});
