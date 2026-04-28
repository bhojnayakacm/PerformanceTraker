"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DRAG_HANDLE_COL_ID } from "@/components/data-table/sortable-table";
import type { Profile } from "@/lib/types";
import { getInitials, getAvatarColor } from "@/lib/utils";

const ROLE_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  super_admin: {
    label: "Super Admin",
    className:
      "bg-violet-100 text-violet-700 border-violet-200/60 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800",
  },
  manager: {
    label: "Manager",
    className:
      "bg-amber-100 text-amber-700 border-amber-200/60 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  },
  editor: {
    label: "Editor",
    className:
      "bg-sky-100 text-sky-700 border-sky-200/60 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800",
  },
  viewer: {
    label: "Viewer",
    className:
      "bg-slate-100 text-slate-600 border-slate-200/60 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  },
};

type ColumnActions = {
  onToggleStatus: (userId: string, currentStatus: boolean) => void;
  onManageAssignments: (profile: Profile) => void;
};

export function getColumns(
  currentUserId: string,
  actions: ColumnActions
): ColumnDef<Profile>[] {
  return [
    {
      id: DRAG_HANDLE_COL_ID,
      header: () => null,
      cell: () => null,
      enableSorting: false,
      enableGlobalFilter: false,
      size: 40,
    },
    {
      accessorKey: "full_name",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-3"
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const name = row.original.full_name || "Unnamed User";
        const isSelf = row.original.id === currentUserId;
        return (
          <div className="flex items-center gap-3">
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${getAvatarColor(name)}`}
            >
              {getInitials(name)}
            </div>
            <div>
              <span className="font-medium">{name}</span>
              {isSelf && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  (You)
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "role",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-3"
        >
          Role
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const role = row.original.role;
        const config = ROLE_CONFIG[role] ?? ROLE_CONFIG.viewer;

        return (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className={config.className}>
              {config.label}
            </Badge>
            {role === "manager" && row.original.id !== currentUserId && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-xs font-medium"
                onClick={() => actions.onManageAssignments(row.original)}
              >
                <UserPlus className="h-3.5 w-3.5" />
                Assign
              </Button>
            )}
          </div>
        );
      },
      filterFn: (row, _columnId, value) => {
        if (value === "all") return true;
        return row.original.role === value;
      },
    },
    {
      accessorKey: "is_active",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-3"
        >
          Status
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const isActive = row.original.is_active;
        const isSelf = row.original.id === currentUserId;

        return (
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0 hover:bg-transparent"
            onClick={() =>
              actions.onToggleStatus(row.original.id, isActive)
            }
            disabled={isSelf}
          >
            <Badge
              variant="secondary"
              className={
                isActive
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200/60 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800"
                  : "bg-slate-100 text-slate-500 border-slate-200/60 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
              }
            >
              {isActive ? "Active" : "Inactive"}
            </Badge>
          </Button>
        );
      },
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-3"
        >
          Joined
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(
            new Date(row.original.created_at)
          )}
        </span>
      ),
    },
  ];
}
