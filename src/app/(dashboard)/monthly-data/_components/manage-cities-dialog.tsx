"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Building2,
  Check,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { City } from "@/lib/types";
import { addCity, deleteCity, updateCity } from "../actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cities: City[];
};

export function ManageCitiesDialog({ open, onOpenChange, cities }: Props) {
  const [isAdding, startAddTransition] = useTransition();
  const [isSaving, startSaveTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  const [newCityName, setNewCityName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<City | null>(null);

  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const busy = isAdding || isSaving || isDeleting;

  const handleAdd = () => {
    const name = newCityName.trim();
    if (!name) {
      toast.error("Enter a city name");
      return;
    }
    startAddTransition(async () => {
      const result = await addCity(name);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Added "${name}" to the city pool`);
      setNewCityName("");
    });
  };

  const startEdit = (city: City) => {
    setEditingId(city.id);
    setEditingValue(city.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingValue("");
  };

  const saveEdit = (city: City) => {
    const trimmed = editingValue.trim();
    if (!trimmed) {
      toast.error("City name cannot be empty");
      return;
    }
    if (trimmed === city.name) {
      cancelEdit();
      return;
    }
    startSaveTransition(async () => {
      const result = await updateCity(city.id, trimmed);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Renamed to "${trimmed}"`);
      cancelEdit();
    });
  };

  const handleDelete = (city: City) => {
    startDeleteTransition(async () => {
      const result = await deleteCity(city.id);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted "${city.name}"`);
      setConfirmDelete(null);
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Manage Cities
            </DialogTitle>
            <DialogDescription>
              The central pool of cities. Everyone picks from this list when
              logging monthly travel.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* ── Existing cities ── */}
            <div className="space-y-2">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Cities in Pool ({cities.length})
              </Label>
              <div className="rounded-lg border bg-muted/30">
                {cities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                    <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                      <MapPin className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      No cities yet. Add your first one below.
                    </p>
                  </div>
                ) : (
                  <ul className="max-h-[280px] divide-y divide-border/60 overflow-y-auto">
                    {cities.map((city) => {
                      const isEditing = editingId === city.id;
                      const rowSaving = isSaving && isEditing;

                      return (
                        <li
                          key={city.id}
                          className="group flex items-center gap-2 px-2.5 py-1.5 transition-colors hover:bg-muted/60"
                        >
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

                          {isEditing ? (
                            <>
                              <Input
                                ref={editInputRef}
                                value={editingValue}
                                onChange={(e) =>
                                  setEditingValue(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    saveEdit(city);
                                  } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    cancelEdit();
                                  }
                                }}
                                disabled={rowSaving}
                                className="h-7 flex-1 text-sm"
                              />
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                onClick={() => saveEdit(city)}
                                disabled={rowSaving || !editingValue.trim()}
                                aria-label={`Save changes to ${city.name}`}
                              >
                                {rowSaving ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                )}
                              </Button>
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                onClick={cancelEdit}
                                disabled={rowSaving}
                                aria-label="Cancel edit"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 truncate text-sm font-medium">
                                {city.name}
                              </span>
                              <div className="flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  onClick={() => startEdit(city)}
                                  disabled={busy}
                                  aria-label={`Edit ${city.name}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  onClick={() => setConfirmDelete(city)}
                                  disabled={busy}
                                  aria-label={`Delete ${city.name}`}
                                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* ── Add new city ── */}
            <div className="space-y-2 rounded-lg border bg-card p-3">
              <Label
                htmlFor="new-city-input"
                className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                Add New City
              </Label>
              <div className="flex gap-2">
                <Input
                  id="new-city-input"
                  placeholder="e.g., Bengaluru"
                  value={newCityName}
                  onChange={(e) => setNewCityName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAdd();
                    }
                  }}
                  disabled={isAdding}
                  className="flex-1"
                />
                <Button
                  type="button"
                  onClick={handleAdd}
                  disabled={isAdding || !newCityName.trim()}
                >
                  {isAdding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="mr-1.5 h-4 w-4" />
                      Add
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(next) => {
          if (!next && !isDeleting) setConfirmDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <Trash2 className="h-4 w-4" />
              </div>
              Delete city?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">
                {confirmDelete?.name}
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
