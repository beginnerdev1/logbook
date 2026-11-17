import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDateOnly } from "@/lib/dateOnly";

export const DASHBOARD_COLUMNS = [
  { accessorKey: "id", header: "Ref No" },
  {
    accessorKey: "date",
    header: "Date",
    cell: ({ row }) => formatDateOnly(row.original.date),
  },
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "particulars",
    header: "Particulars",
    cell: ({ row }) => (
      <span
        className="block max-w-64 truncate"
        title={row.original.particulars}
      >
        {row.original.particulars}
      </span>
    ),
  },
  { accessorKey: "submittedBy", header: "Submitted By" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];
