import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChipMultiSelect } from "../ChipMultiSelect";

vi.mock("@radix-ui/react-popover", async () => {
  const React = await import("react");
  const { useState } = React;

  function Root({ children, open: controlledOpen, onOpenChange }: any) {
    const [internalOpen, setInternalOpen] = useState(false);
    const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
    const setOpen = onOpenChange ?? setInternalOpen;
    return React.createElement(
      "div",
      { "data-popover-root": "true" },
      React.Children.map(children, (child: any) =>
        React.cloneElement(child, { __isOpen: isOpen, __setOpen: setOpen })
      )
    );
  }

  function Trigger({ children, asChild, __setOpen, __isOpen: _isOpen }: any) {
    const child = asChild ? React.Children.only(children) : children;
    if (asChild && React.isValidElement(child)) {
      return React.cloneElement(child as React.ReactElement<any>, {
        onClick: (...args: any[]) => {
          (child as any).props.onClick?.(...args);
          __setOpen?.(true);
        },
      });
    }
    return React.createElement("div", { onClick: () => __setOpen?.(true) }, child);
  }

  function Portal({ children }: any) {
    return React.createElement(React.Fragment, null, children);
  }

  function Content({ children, __isOpen }: any) {
    if (!__isOpen) return null;
    return React.createElement("div", { "data-popover-content": "true" }, children);
  }

  function Anchor({ children }: any) {
    return React.createElement(React.Fragment, null, children);
  }

  return { Root, Trigger, Portal, Content, Anchor };
});

const OPTIONS = [
  { value: "pop", label: "Pop" },
  { value: "trap", label: "Trap Rap" },
  { value: "jazz", label: "Jazz" },
];

const GROUPED_OPTIONS = [
  { value: "happy", label: "Happy", group: "positive" },
  { value: "sad", label: "Sad", group: "negative" },
  { value: "calm", label: "Calm", group: "neutral" },
];

describe("ChipMultiSelect", () => {
  it("renders chips for initial value array", () => {
    render(
      <ChipMultiSelect
        value={["pop", "trap"]}
        options={OPTIONS}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText("Pop")).toBeInTheDocument();
    expect(screen.getByText("Trap Rap")).toBeInTheDocument();
  });

  it("clicking × on a chip calls onChange with that value removed", () => {
    const onChange = vi.fn();
    render(
      <ChipMultiSelect
        value={["pop", "trap"]}
        options={OPTIONS}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByLabelText("Remove Pop"));
    expect(onChange).toHaveBeenCalledWith(["trap"]);
  });

  it("clicking + Add button opens popover", () => {
    const { container } = render(
      <ChipMultiSelect
        value={[]}
        options={OPTIONS}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(container.querySelector("[data-add-button]")!);
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
  });

  it("checking an option then clicking Apply fires onChange with new value added", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChipMultiSelect
        value={["pop"]}
        options={OPTIONS}
        onChange={onChange}
      />
    );
    fireEvent.click(container.querySelector("[data-add-button]")!);
    const trapCheckbox = screen.getByRole("checkbox", { name: /trap rap/i });
    fireEvent.click(trapCheckbox);
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    expect(onChange).toHaveBeenCalledWith(["pop", "trap"]);
  });

  it("with allowCustomAdd: typing in input + clicking Add adds option to selection", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChipMultiSelect
        value={[]}
        options={OPTIONS}
        onChange={onChange}
        allowCustomAdd
      />
    );
    fireEvent.click(container.querySelector("[data-add-button]")!);
    const input = screen.getByPlaceholderText(/type to add/i);
    fireEvent.change(input, { target: { value: "my-custom-producer" } });
    fireEvent.click(screen.getByRole("button", { name: /add custom value/i }));
    const checkbox = screen.getByRole("checkbox", { name: /my-custom-producer/i });
    expect(checkbox).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    expect(onChange).toHaveBeenCalledWith(["my-custom-producer"]);
  });

  it("without allowCustomAdd: text input is not rendered", () => {
    const { container } = render(
      <ChipMultiSelect
        value={[]}
        options={OPTIONS}
        onChange={vi.fn()}
      />
    );
    fireEvent.click(container.querySelector("[data-add-button]")!);
    expect(screen.queryByPlaceholderText(/type to add/i)).toBeNull();
  });

  it("group headers render when options have group field", () => {
    const { container } = render(
      <ChipMultiSelect
        value={[]}
        options={GROUPED_OPTIONS}
        onChange={vi.fn()}
        popoverTitle="Moods"
      />
    );
    fireEvent.click(container.querySelector("[data-add-button]")!);
    expect(screen.getByText("positive")).toBeInTheDocument();
    expect(screen.getByText("negative")).toBeInTheDocument();
    expect(screen.getByText("neutral")).toBeInTheDocument();
  });

  it("Cancel discards picker changes without calling onChange", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChipMultiSelect
        value={["pop"]}
        options={OPTIONS}
        onChange={onChange}
      />
    );
    fireEvent.click(container.querySelector("[data-add-button]")!);
    const trapCheckbox = screen.getByRole("checkbox", { name: /trap rap/i });
    fireEvent.click(trapCheckbox);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders data-chip-multiselect attribute on root", () => {
    const { container } = render(
      <ChipMultiSelect value={[]} options={OPTIONS} onChange={vi.fn()} />
    );
    expect(container.querySelector("[data-chip-multiselect]")).toBeInTheDocument();
  });

  it("renders data-add-button attribute on Add button", () => {
    const { container } = render(
      <ChipMultiSelect value={[]} options={OPTIONS} onChange={vi.fn()} />
    );
    expect(container.querySelector("[data-add-button]")).toBeInTheDocument();
  });

  it("maxSelections=1 renders single-select trigger (no chips), replaces on pick", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ChipMultiSelect
        value={["pop"]}
        options={OPTIONS}
        onChange={onChange}
        maxSelections={1}
      />
    );
    // Single-select trigger lives on the data-add-button (label = current value)
    const trigger = container.querySelector("[data-add-button]") as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    expect(trigger.textContent).toContain("Pop");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByLabelText("Trap Rap"));
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    expect(onChange).toHaveBeenCalledWith(["trap"]);
  });

  it("maxSelections=2 blocks selecting a 3rd un-selected option", () => {
    const onChange = vi.fn();
    render(
      <ChipMultiSelect
        value={["pop", "trap"]}
        options={OPTIONS}
        onChange={onChange}
        maxSelections={2}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    const jazz = screen.getByLabelText("Jazz") as HTMLInputElement;
    expect(jazz).toBeDisabled();
  });

  it("maxSelections cap allows deselect (uncheck a selected) even when at cap", () => {
    const onChange = vi.fn();
    render(
      <ChipMultiSelect
        value={["pop", "trap"]}
        options={OPTIONS}
        onChange={onChange}
        maxSelections={2}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    // Uncheck trap — should work (deselect always allowed)
    const trap = screen.getByLabelText("Trap Rap");
    fireEvent.click(trap);
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    expect(onChange).toHaveBeenCalledWith(["pop"]);
  });

  describe("per-option manage tray", () => {
    it("renders ⋯ buttons only when onRenameOption/onDeleteOption is provided", () => {
      const onChange = vi.fn();
      const { rerender } = render(
        <ChipMultiSelect value={[]} options={OPTIONS} onChange={onChange} />,
      );
      fireEvent.click(screen.getByRole("button", { name: /add/i }));
      expect(screen.queryByTestId("chip-manage-pop")).not.toBeInTheDocument();

      rerender(
        <ChipMultiSelect
          value={[]}
          options={OPTIONS}
          onChange={onChange}
          onRenameOption={vi.fn()}
        />,
      );
      expect(screen.getByTestId("chip-manage-pop")).toBeInTheDocument();
    });

    it("clicking ⋯ swaps the row for an inline input + check/trash/cancel buttons", () => {
      const onChange = vi.fn();
      render(
        <ChipMultiSelect
          value={[]}
          options={OPTIONS}
          onChange={onChange}
          onRenameOption={vi.fn()}
          onDeleteOption={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /add/i }));
      fireEvent.click(screen.getByTestId("chip-manage-pop"));
      const tray = screen.getByLabelText("Rename value") as HTMLInputElement;
      expect(tray.value).toBe("pop");
      expect(screen.getByLabelText("Confirm rename")).toBeInTheDocument();
      expect(screen.getByLabelText("Delete value globally")).toBeInTheDocument();
    });

    it("Enter on the rename input calls onRenameOption with old and new values", async () => {
      const onChange = vi.fn();
      const onRename = vi.fn().mockResolvedValue(undefined);
      render(
        <ChipMultiSelect
          value={[]}
          options={OPTIONS}
          onChange={onChange}
          onRenameOption={onRename}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /add/i }));
      fireEvent.click(screen.getByTestId("chip-manage-pop"));
      const input = screen.getByLabelText("Rename value") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Pop Music" } });
      fireEvent.keyDown(input, { key: "Enter" });
      // Microtask flush
      await Promise.resolve();
      expect(onRename).toHaveBeenCalledWith("pop", "Pop Music");
    });

    it("trash button calls onDeleteOption with the value", async () => {
      const onChange = vi.fn();
      const onDelete = vi.fn().mockResolvedValue(undefined);
      render(
        <ChipMultiSelect
          value={[]}
          options={OPTIONS}
          onChange={onChange}
          onDeleteOption={onDelete}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /add/i }));
      fireEvent.click(screen.getByTestId("chip-manage-trap"));
      fireEvent.click(screen.getByLabelText("Delete value globally"));
      await Promise.resolve();
      expect(onDelete).toHaveBeenCalledWith("trap");
    });
  });
});
