import { Pencil, UserRoundCheck, UserRoundX } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { USER_STATUSES } from "@/lib/constants";

function formatDate(value) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatLastLogin(value) {
  if (!value || value === "Never") return "Never";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export const USER_COLUMNS = [
  { accessorKey: "id", header: "User ID" },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.name}</span>
    ),
  },
  { accessorKey: "email", header: "Email" },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => (row.original.role === "admin" ? "Admin" : "User"),
  },
  {
    accessorKey: "isActive",
    header: "Status",
    cell: ({ row }) => (
      <StatusBadge
        status={row.original.isActive ? USER_STATUSES.ACTIVE : USER_STATUSES.INACTIVE}
      />
    ),
  },
  {
    accessorKey: "createdAt",
    header: "Created date",
    cell: ({ row }) => formatDate(row.original.createdAt),
  },
  {
    accessorKey: "lastLogin",
    header: "Last login",
    cell: ({ row }) => formatLastLogin(row.original.lastLogin),
  },
  {
    id: "actions",
    header: "Actions",
    enableSorting: false,
    cell: ({ row, table }) => {
      const user = row.original;
      const { onEdit, onToggleActive } = table.options.meta ?? {};
      const ActiveIcon = user.isActive ? UserRoundX : UserRoundCheck;

      return (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit user ${user.name}`}
            onClick={() => onEdit?.(user)}
          >
            <Pencil aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`${user.isActive ? "Deactivate" : "Activate"} user ${user.name}`}
            onClick={() => onToggleActive?.(user)}
          >
            <ActiveIcon aria-hidden="true" />
            {user.isActive ? "Deactivate" : "Activate"}
          </Button>
        </div>
      );
    },
  },
];