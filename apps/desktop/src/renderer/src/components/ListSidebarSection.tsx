import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Folder, Music, Package, Plus } from "lucide-react";

import { useListStore } from "@/stores/lists";

export function ListSidebarSection(): React.JSX.Element {
  const all = useListStore((s) => s.all);
  const refresh = useListStore((s) => s.refresh);
  const createList = useListStore((s) => s.create);
  const navigate = useNavigate();
  const location = useLocation();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    refresh();
  }, [refresh]);

  const systemList = all.find((l) => l.kind === "system");
  const userLists = all.filter((l) => l.kind === "user");
  const beattapes = all.filter((l) => l.kind === "beattape");

  async function onCreate() {
    if (!newName.trim()) {
      setCreating(false);
      return;
    }
    await createList(newName.trim(), "user");
    setNewName("");
    setCreating(false);
  }

  function isActive(path: string) {
    return location.pathname === path;
  }

  return (
    <nav className="flex-1 overflow-y-auto px-2 mt-2 space-y-3">
      {/* System list */}
      {systemList && (
        <button
          onClick={() => navigate("/")}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm relative ${
            isActive("/") || isActive(`/lists/${systemList.id}`)
              ? "bg-bg-row-selected text-text-primary"
              : "text-text-secondary hover:bg-bg-row-hover hover:text-text-primary"
          }`}
        >
          {(isActive("/") || isActive(`/lists/${systemList.id}`)) && (
            <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-accent" />
          )}
          <Folder size={16} />
          <span>{systemList.name}</span>
        </button>
      )}

      {/* User lists */}
      {userLists.length > 0 && (
        <div>
          <div className="px-3 text-[10px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-1">
            Lists
          </div>
          {userLists.map((l) => (
            <button
              key={l.id}
              onClick={() => navigate(`/lists/${l.id}`)}
              className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm ${
                isActive(`/lists/${l.id}`)
                  ? "bg-bg-row-selected text-text-primary"
                  : "text-text-secondary hover:bg-bg-row-hover hover:text-text-primary"
              }`}
            >
              <Music size={14} />
              <span className="flex-1 text-left truncate">{l.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Beattapes */}
      {beattapes.length > 0 && (
        <div>
          <div className="px-3 text-[10px] uppercase tracking-[0.05em] font-semibold text-text-tertiary mb-1">
            Beattapes
          </div>
          {beattapes.map((l) => (
            <button
              key={l.id}
              onClick={() => navigate(`/lists/${l.id}`)}
              className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm ${
                isActive(`/lists/${l.id}`)
                  ? "bg-bg-row-selected text-text-primary"
                  : "text-text-secondary hover:bg-bg-row-hover hover:text-text-primary"
              }`}
            >
              <Package size={14} />
              <span className="flex-1 text-left truncate">{l.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* + New list */}
      {creating ? (
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={onCreate}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCreate();
            if (e.key === "Escape") {
              setNewName("");
              setCreating(false);
            }
          }}
          placeholder="List name…"
          className="w-full bg-bg-elevated border border-border-subtle rounded-md px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent"
        />
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="w-full flex items-center gap-3 px-3 py-1.5 rounded-md text-sm text-text-tertiary hover:text-text-secondary hover:bg-bg-row-hover"
        >
          <Plus size={14} />
          <span>New list</span>
        </button>
      )}
    </nav>
  );
}
