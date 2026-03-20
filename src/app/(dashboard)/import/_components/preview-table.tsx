"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ValidatedRow } from "../_lib/import-helpers";

type Props = {
  rows: ValidatedRow[];
  headers: string[];
};

export function PreviewTable({ rows, headers }: Props) {
  return (
    <div className="rounded-lg border overflow-x-auto max-h-[400px] overflow-y-auto">
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10">
          <TableRow>
            <TableHead className="w-[50px]">#</TableHead>
            <TableHead className="w-[80px]">Status</TableHead>
            {headers.map((h) => (
              <TableHead key={h} className="whitespace-nowrap">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.rowNumber}
              className={row.isValid ? "" : "bg-destructive/5"}
            >
              <TableCell className="text-muted-foreground text-xs">
                {row.rowNumber}
              </TableCell>
              <TableCell>
                {row.isValid ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <div className="flex items-center gap-1">
                    <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    <span
                      className="text-xs text-destructive truncate max-w-[200px]"
                      title={row.errors.join("; ")}
                    >
                      {row.errors[0]}
                    </span>
                  </div>
                )}
              </TableCell>
              {headers.map((h) => (
                <TableCell key={h} className="text-sm whitespace-nowrap">
                  {String(
                    (row.data as Record<string, unknown>)[h] ?? "—"
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
