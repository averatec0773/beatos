import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { AppShell } from "@/routes/AppShell";

export default function App(): React.JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/*" element={<AppShell />} />
      </Routes>
    </BrowserRouter>
  );
}
