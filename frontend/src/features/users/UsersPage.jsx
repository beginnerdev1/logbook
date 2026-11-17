import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UserFormDialog } from "@/features/users/UserFormDialog";
import { USER_COLUMNS } from "@/features/users/userColumns";
import { createUser, listUsers, setUserActive, updateUser } from "@/services/usersService";

function filterUsers(users, query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return users;

  return users.filter((user) =>
    [user.id, user.name, user.email, user.role, user.isActive ? "active" : "inactive"]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery),
  );
}

export function UsersPage() {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [confirmUser, setConfirmUser] = useState(null);

  useEffect(() => {
    let isActive = true;

    listUsers()
      .then((items) => {
        if (isActive) {
          setUsers(items);
          setLoadError("");
        }
      })
      .catch(() => {
        if (isActive) setLoadError("Sample users could not be loaded.");
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [reloadKey]);

  const filteredUsers = useMemo(() => filterUsers(users, query), [users, query]);
  const confirmIsActive = Boolean(confirmUser?.isActive);
  const tableMeta = {
    onEdit: (user) => {
      setEditingUser(user);
      setFormOpen(true);
    },
    onToggleActive: setConfirmUser,
  };

  function retryLoad() {
    setIsLoading(true);
    setLoadError("");
    setReloadKey((key) => key + 1);
  }

  function openAddDialog() {
    setEditingUser(null);
    setFormOpen(true);
  }

  async function saveUser(values) {
    try {
      if (editingUser) {
        await updateUser(editingUser.id, values);
        toast.success("Simulated: sample user updated for this session.");
      } else {
        await createUser(values);
        toast.success("Simulated: sample user added for this session.");
      }

      setFormOpen(false);
      setEditingUser(null);
      retryLoad();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The sample user could not be saved.",
      );
    }
  }

  async function confirmActiveChange() {
    if (!confirmUser) return;

    try {
      await setUserActive(confirmUser.id, !confirmUser.isActive);
      toast.success(
        `Simulated: ${confirmUser.name} marked ${confirmUser.isActive ? "inactive" : "active"} in sample data.`,
      );
      setConfirmUser(null);
      retryLoad();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The sample user status could not be changed.",
      );
    }
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Manage sample user profiles and their assigned roles."
      />
      <p className="mb-4 text-xs text-muted-foreground">
        Sample data · Changes are simulated and remain in memory for this session.
      </p>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-sm">
          <Label htmlFor="user-search">Search users</Label>
          <div className="relative mt-1">
            <Search
              aria-hidden="true"
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="user-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, email, role, status..."
              className="pl-9"
            />
          </div>
        </div>
        <Button type="button" onClick={openAddDialog}>
          <Plus aria-hidden="true" />
          Add user
        </Button>
      </div>

      <section className="overflow-hidden rounded-md border border-border bg-card">
        <DataTable
          columns={USER_COLUMNS}
          data={filteredUsers}
          meta={tableMeta}
          isLoading={isLoading}
          error={loadError}
          onRetry={retryLoad}
          emptyMessage={users.length ? "No users match this search." : "No sample users are available."}
          caption="Sample users, roles, status, and account dates"
        />
      </section>

      <UserFormDialog
        open={formOpen}
        user={editingUser}
        onClose={() => {
          setFormOpen(false);
          setEditingUser(null);
        }}
        onSave={saveUser}
      />

      <AlertDialog
        open={Boolean(confirmUser)}
        onOpenChange={(open) => {
          if (!open) setConfirmUser(null);
        }}
      >
        <AlertDialogContent>
          {confirmUser && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {confirmIsActive ? "Deactivate user?" : "Activate user?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {confirmUser.name} will be marked {confirmIsActive ? "inactive" : "active"} in sample data.
                  This does not change the current simulated session.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant={confirmIsActive ? "destructive" : "default"}
                  onClick={confirmActiveChange}
                >
                  {confirmIsActive ? "Deactivate" : "Activate"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}