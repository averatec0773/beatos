import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AppShell } from "@/routes/AppShell";
import { TrackListPanel } from "@/routes/TrackListPanel";
import { TrackEditor } from "@/routes/TrackEditor";
import { SettingsPanel } from "@/routes/SettingsPanel";

export default function App(): React.JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<TrackListPanel />} />
          <Route path="/tracks/:id/edit" element={<TrackEditor />} />
          <Route path="/settings" element={<SettingsPanel />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
