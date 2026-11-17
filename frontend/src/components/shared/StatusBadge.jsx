import { Badge } from "@/components/ui/badge";
import {
  PROCESSING_STATUSES,
  RECORD_STATUSES,
  SYSTEM_STATUSES,
  USER_STATUSES,
} from "@/lib/constants";

const STATUS_VARIANTS = {
  [RECORD_STATUSES.DRAFT]: "secondary",
  [RECORD_STATUSES.PENDING]: "secondary",
  [RECORD_STATUSES.PROCESSING]: "outline",
  [RECORD_STATUSES.APPROVED]: "default",
  [RECORD_STATUSES.REJECTED]: "destructive",
  [RECORD_STATUSES.FAILED]: "destructive",
  [PROCESSING_STATUSES.COMPLETED]: "secondary",
  [PROCESSING_STATUSES.NOT_SUBMITTED]: "outline",
  [USER_STATUSES.ACTIVE]: "secondary",
  [USER_STATUSES.INACTIVE]: "outline",
  [SYSTEM_STATUSES.SIMULATED]: "secondary",
  [SYSTEM_STATUSES.NOT_CONNECTED]: "outline",
};

export function StatusBadge({ status }) {
  return (
    <Badge
      variant={STATUS_VARIANTS[status] ?? "outline"}
      aria-label={`Status: ${status}`}
    >
      {status}
    </Badge>
  );
}
