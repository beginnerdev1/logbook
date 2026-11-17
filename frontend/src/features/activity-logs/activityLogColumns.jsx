function formatTimestamp(value) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export const ACTIVITY_LOG_COLUMNS = [
  {
    accessorKey: "timestamp",
    header: "Timestamp",
    cell: ({ row }) => formatTimestamp(row.original.timestamp),
  },
  { accessorKey: "user", header: "User" },
  { accessorKey: "action", header: "Action" },
  { accessorKey: "resource", header: "Resource" },
  { accessorKey: "result", header: "Result" },
  {
    accessorKey: "details",
    header: "Details",
    cell: ({ row }) => (
      <span className="block max-w-72 truncate" title={row.original.details}>
        {row.original.details}
      </span>
    ),
  },
];