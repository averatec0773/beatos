import React from "react";
import { useLocation, matchPath } from "react-router-dom";

import { useListStore } from "@/stores/lists";

export function TopBarRouteTitle(): React.JSX.Element {
  const location = useLocation();
  const lists = useListStore((s) => s.all);

  let title = "BeatOS";
  if (location.pathname === "/") {
    title = "All Beats";
  } else if (location.pathname === "/settings") {
    title = "Settings";
  } else if (matchPath("/tracks/new", location.pathname)) {
    title = "New Track";
  } else if (matchPath("/tracks/:id/edit", location.pathname)) {
    title = "Editor";
  } else {
    const m = matchPath("/lists/:id", location.pathname);
    if (m) {
      const id = Number(m.params.id);
      const found = lists.find((l) => l.id === id);
      if (found) title = found.name;
    }
  }

  return (
    <div className="text-[15px] font-medium text-text-primary truncate select-none">{title}</div>
  );
}
