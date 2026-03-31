"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, Check, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Profile, UserRole } from "@/lib/types";
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

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "super_admin", label: "Super Admin" },
  { value: "editor", label: "Editor" },
  { value: "viewer", label: "Viewer" },
];

type ColumnActions = {
  onRoleChange: (userId: string, newRole: UserRole) => void;
  onToggleStatus: (userId: string, currentStatus: boolean) => void;
};

export function getColumns(
  currentUserId: string,
  actions: ColumnActions
): ColumnDef<Profile>[] {
  return [
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
      header: "Role",
      cell: ({ row }) => {
        const role = row.original.role;
        const isSelf = row.original.id === currentUserId;
        const config = ROLE_CONFIG[role] ?? ROLE_CONFIG.viewer;

        if (isSelf) {
          return (
            <Badge variant="secondary" className={config.className}>
              {config.label}
            </Badge>
          );
        }

        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto rounded-full p-0 hover:bg-transparent focus-visible:ring-offset-0"
                />
              }
            >
              <Badge
                variant="secondary"
                className={`cursor-pointer pr-1.5 transition-shadow hover:ring-2 hover:ring-ring/20 ${config.className}`}
              >
                {config.label}
                <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
              </Badge>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {ROLE_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() =>
                    actions.onRoleChange(row.original.id, opt.value)
                  }
                >
                  {role === opt.value ? (
                    <Check className="mr-2 h-4 w-4" />
                  ) : (
                    <span className="mr-2 w-4" />
                  )}
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
      filterFn: (row, _columnId, value) => {
        if (value === "all") return true;
        return row.original.role === value;
      },
    },
    {
      accessorKey: "is_active",
      header: "Status",
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
