import { render, screen } from "@testing-library/react";
import HomePage from "@/app/page";

describe("HomePage", () => {
  it("introduces the local GTM server deployment workflow", () => {
    render(<HomePage />);

    expect(
      screen.getByText("Deploy GTM Server-Side tagging infrastructure from your machine"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Deploy to GCP" })).toHaveAttribute("href", "/deploy");
  });
});
