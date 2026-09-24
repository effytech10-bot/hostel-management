import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRole } from "@/server/auth/session";
import { getCashierBuildingMap, listBuildings } from "@/server/services/buildings";
import { listStaff } from "@/server/services/members";
import { CashierBuildingsForm } from "./cashier-buildings-form";
import { CreateStaffForm } from "./create-staff-form";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const actor = await requireRole("admin");
  const [staff, buildingList, cashierBuildings] = await Promise.all([
    listStaff(actor),
    listBuildings(actor),
    getCashierBuildingMap(actor),
  ]);
  const buildingOptions = buildingList.map((b) => ({ id: b.id, code: b.code }));

  return (
    <>
      <PageHeader
        title="Users"
        description="Admins and cashiers who can log in. A cashier only sees the buildings ticked for them. Student logins are created at admission."
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Add a user</CardTitle>
          <CardDescription>
            Give the person their phone number and this password. They must choose their own password at the first
            login.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateStaffForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All users ({staff.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Buildings</TableHead>
                <TableHead>Reset password</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    {m.fullName}
                    {m.id === actor.membershipId && <span className="text-muted-foreground ml-2 text-xs">(you)</span>}
                  </TableCell>
                  <TableCell className="tabular-nums">{m.phone}</TableCell>
                  <TableCell>
                    <Badge variant={m.role === "admin" ? "default" : "secondary"}>{m.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.isActive ? "success" : "destructive"}>{m.isActive ? "Active" : "Disabled"}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {m.role === "cashier" ? (
                      <CashierBuildingsForm
                        membershipId={m.id}
                        buildings={buildingOptions}
                        selected={cashierBuildings.get(m.id) ?? []}
                      />
                    ) : (
                      <span className="text-muted-foreground text-xs">All</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <ResetPasswordForm membershipId={m.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
