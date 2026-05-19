import { render, screen } from "@testing-library/react";
import { OfflineBadge } from "@/components/OfflineBadge";

describe("OfflineBadge", () => {
  it("renders nothing when missing is false", () => {
    const { container } = render(<OfflineBadge missing={false} />);
    expect(container.firstChild).toBeNull();
  });
  it("renders 'Offline' when missing is true", () => {
    render(<OfflineBadge missing={true} />);
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });
  it("renders nothing when missing is undefined", () => {
    const { container } = render(<OfflineBadge missing={undefined} />);
    expect(container.firstChild).toBeNull();
  });
});
