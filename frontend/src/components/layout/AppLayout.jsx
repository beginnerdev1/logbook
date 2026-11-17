import { useState } from "react";
import { Outlet } from "react-router-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/layout/AppHeader";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarInset } from "@/components/ui/sidebar";

export function AppLayout() {
  const [statusMessage, setStatusMessage] = useState("");

  return (
    <div className="flex min-h-svh w-full">
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <AppHeader onSimulatedAction={setStatusMessage} />
        {statusMessage && (
          <div
            className="flex items-center justify-between gap-3 border-b border-border bg-muted/50 px-4 py-2 text-sm text-muted-foreground md:px-6"
            role="status"
          >
            <span>{statusMessage}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Dismiss message"
              onClick={() => setStatusMessage("")}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        )}
        <div className="flex-1 p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </div>
  );
}
