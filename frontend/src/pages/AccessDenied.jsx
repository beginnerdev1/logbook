import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";

export function AccessDenied() {
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Access Denied"
        description="Your simulated role does not have access to this section."
      />
      <Button render={<Link to="/" />} nativeButton={false}>
        Return to Dashboard
      </Button>
    </div>
  );
}
