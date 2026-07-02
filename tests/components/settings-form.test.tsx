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
});
