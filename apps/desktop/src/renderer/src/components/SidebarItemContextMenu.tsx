import React from "react";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface Props {
  children: React.ReactNode;
  onRename: () => void;
  onDelete: () => void;
}

export function SidebarItemContextMenu({ children, onRename, onDelete }: Props): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onRename}>{t("contextMenu.rename")}</ContextMenuItem>
        <ContextMenuItem onSelect={onDelete} className="text-danger">
          {t("contextMenu.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
