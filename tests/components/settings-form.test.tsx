import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsForm } from "@/components/settings/settings-form";

describe("SettingsForm", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          settings: { terraformPath: "terraform", gcloudPath: "gcloud", dockerPath: "docker" }
        }),
      ),
    );
  });

  it("saves local binary paths", async () => {
    const user = userEvent.setup();
    render(<SettingsForm />);

    await user.clear(await screen.findByLabelText("Terraform path"));
    await user.type(screen.getByLabelText("Terraform path"), "/opt/bin/terraform");
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/settings",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps default settings when loading fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "Unable to load settings." }, { status: 500 })),
    );

    render(<SettingsForm />);

    expect(await screen.findByDisplayValue("terraform")).toBeInTheDocument();
    expect(screen.getByDisplayValue("gcloud")).toBeInTheDocument();
    expect(screen.getByDisplayValue("docker")).toBeInTheDocument();
    expect(
      screen.getByText("/api/settings could not be loaded. Check the local settings API, then try again."),
    ).toBeInTheDocument();
    expect(screen.getByText("Unable to load settings.")).toBeInTheDocument();
  });

  it("keeps current settings when saving fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return Response.json({ error: "Unable to save settings." }, { status: 500 });
        }

        return Response.json({
          settings: { terraformPath: "terraform", gcloudPath: "gcloud", dockerPath: "docker" }
        });
      }),
    );

    render(<SettingsForm />);

    await user.clear(await screen.findByLabelText("Terraform path"));
    await user.type(screen.getByLabelText("Terraform path"), "/opt/bin/terraform");
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    expect(screen.getByDisplayValue("/opt/bin/terraform")).toBeInTheDocument();
    expect(
      await screen.findByText("/api/settings could not be saved. Check the local settings API, then try again."),
    ).toBeInTheDocument();
    expect(screen.getByText("Unable to save settings.")).toBeInTheDocument();
  });
});
