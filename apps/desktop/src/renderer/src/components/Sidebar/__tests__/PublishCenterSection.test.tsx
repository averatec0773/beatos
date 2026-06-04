import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { PublishCenterSection } from "@/components/Sidebar/PublishCenterSection";
import { useProStore } from "@/stores/pro";

function renderSection() {
  return render(
    <MemoryRouter>
      <PublishCenterSection />
    </MemoryRouter>,
  );
}

describe("PublishCenterSection", () => {
  it("shows a lock affordance when Pro is unavailable", () => {
    useProStore.setState({ publishAvailable: false, loaded: true });
    renderSection();
    expect(screen.getByLabelText(/发布中心/)).toHaveAttribute("data-locked", "");
  });

  it("is an unlocked nav entry when Pro is available", () => {
    useProStore.setState({ publishAvailable: true, loaded: true });
    renderSection();
    expect(screen.getByLabelText(/发布中心/)).not.toHaveAttribute("data-locked");
  });
});
