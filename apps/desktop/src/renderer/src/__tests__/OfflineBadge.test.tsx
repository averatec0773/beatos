import { render, screen } from "@testing-library/react";
import { OfflineBadge } from "@/components/OfflineBadge";

it("renders offline label", () => {
  render(<OfflineBadge />);
  expect(screen.getByText(/drive offline/i)).toBeInTheDocument();
});
