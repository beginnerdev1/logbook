import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";

export function NotFound() {
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Page Not Found"
        description="The requested page does not exist."
      />
      <Button render={<Link to="/" />} nativeButton={false}>
        Return to Dashboard
      </Button>
    </div>
  );
}
