import {
  Activity,
  ArchiveRestore,
  BookOpenText,
  ChartNoAxesCombined,
  ClipboardCheck,
  Database,
  Files,
  Gauge,
  History,
  ScanLine,
  Settings,
  UsersRound,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { NAVIGATION } from "@/lib/constants";
import { useRole } from "@/hooks/useRole";

const NAV_ICONS = {
  dashboard: Gauge,
  "new-entry": ScanLine,
  "ai-processing": ScanLine,
  records: BookOpenText,
  approvals: ClipboardCheck,
  users: UsersRound,
  "activity-logs": Activity,
  settings: Settings,
  "data-status": Database,
  "backup-restore": ArchiveRestore,
  reports: ChartNoAxesCombined,
  "submission-history": History,
  profile: Files,
};

export function AppSidebar() {
  const { role } = useRole();
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BookOpenText aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold">Logbook System</p>
            <p className="text-xs text-sidebar-foreground/70">Workspace</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAVIGATION[role].map((item) => {
                const Icon = NAV_ICONS[item.icon];
                const isActive =
                  item.path === "/" ? pathname === "/" : pathname === item.path;

                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      render={
                        <NavLink to={item.path} end={item.path === "/"} />
                      }
                      isActive={isActive}
                      tooltip={item.label}
                      onClick={() => {
                        if (isMobile) setOpenMobile(false);
                      }}
                    >
                      <Icon aria-hidden="true" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3">
        <p className="text-xs text-muted-foreground group-data-[collapsible=icon]:sr-only">
          Simulated workspace
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
