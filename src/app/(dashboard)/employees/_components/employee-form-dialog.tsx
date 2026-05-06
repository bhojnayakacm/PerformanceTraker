"use client";

import { useTransition, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
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
import {
  employeeCreateSchema,
  type EmployeeCreateInput,
} from "@/lib/validators/employee";
import { createEmployee, updateEmployee } from "../actions";
import type { Employee } from "@/lib/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: Employee | null;
};

export function EmployeeFormDialog({ open, onOpenChange, employee }: Props) {
  const isEditing = !!employee;
  const [isPending, startTransition] = useTransition();

  const form = useForm<EmployeeCreateInput>({
    resolver: zodResolver(employeeCreateSchema),
    defaultValues: {
      emp_id: "",
      name: "",
      location: "",
      state: "",
      date_of_joining: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        emp_id: employee?.emp_id ?? "",
        name: employee?.name ?? "",
        location: employee?.location ?? "",
        state: employee?.state ?? "",
        // Postgres DATE comes back as YYYY-MM-DD; <input type="date">
        // takes the same shape, so it's a 1:1 hand-off.
        date_of_joining: employee?.date_of_joining ?? "",
      });
    }
  }, [open, employee, form]);

  function onSubmit(values: EmployeeCreateInput) {
    startTransition(async () => {
      const result = isEditing
        ? await updateEmployee({ ...values, id: employee!.id })
        : await createEmployee(values);

      if ("error" in result) {
        if ("field" in result && result.field) {
          form.setError(result.field as keyof EmployeeCreateInput, {
            message: result.error,
          });
        } else {
          toast.error(result.error);
        }
        return;
      }

      toast.success(
        isEditing ? "Employee updated successfully" : "Employee added successfully"
      );
      form.reset();
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Employee" : "Add Employee"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the employee record."
              : "Fill in the details to add a new employee."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="emp_id">Employee ID</Label>
            <Input
              id="emp_id"
              placeholder="e.g. ACM01157"
              {...form.register("emp_id")}
            />
            {form.formState.errors.emp_id && (
              <p className="text-sm text-destructive">
                {form.formState.errors.emp_id.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              placeholder="e.g. John Doe"
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="e.g. Mumbai"
                {...form.register("location")}
              />
              {form.formState.errors.location && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.location.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                placeholder="e.g. Maharashtra"
                {...form.register("state")}
              />
              {form.formState.errors.state && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.state.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="date_of_joining">Date of Joining</Label>
            <Input
              id="date_of_joining"
              type="date"
              {...form.register("date_of_joining")}
            />
            {form.formState.errors.date_of_joining && (
              <p className="text-sm text-destructive">
                {form.formState.errors.date_of_joining.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? isEditing
                  ? "Saving..."
                  : "Adding..."
                : isEditing
                  ? "Save Changes"
                  : "Add Employee"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
