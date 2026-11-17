import { useEffect, useState } from "react";
import { Bell, ChevronDown, LogOut } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { isRealServiceEnabled } from "@/lib/apiClient";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { NAV_ITEMS } from "@/lib/constants";
import { PATHS } from "@/lib/paths";
import { ROLES } from "@/lib/permissions";
import { useRole } from "@/hooks/useRole";
import {
  listNotifications,
  markNotificationRead,
} from "@/services/notificationsService";

export function AppHeader({ onSimulatedAction }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { role, setRole, user } = useRole();
  const [notifications, setNotifications] = useState([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const currentPage = NAV_ITEMS.find((item) => item.path === pathname);
  const isRealAuthMode = isRealServiceEnabled("auth");
  const pageTitle =
    currentPage?.label ??
    (pathname === PATHS.accessDenied ? "Access Denied" : "Not Found");
  const profilePath = PATHS.profile;
  const unreadCount = notifications.filter(
    (notification) => !notification.read,
  ).length;

  useEffect(() => {
    let isActive = true;

    listNotifications(role)
      .then((items) => {
        if (isActive) setNotifications(items);
      })
      .catch(() => {
        if (isActive) setNotifications([]);
      });

    return () => {
      isActive = false;
    };
  }, [role]);

  async function handleOpenNotifications() {
    if (!notificationOpen) {
      const nextNotifications = await listNotifications(role);
      setNotifications(nextNotifications);
      setNotificationOpen(true);
    }
  }

  async function handleDismissNotification(notificationId) {
    const updatedNotification = await markNotificationRead(notificationId);
    setNotifications((currentNotifications) =>
      currentNotifications.map((notification) =>
        notification.id === notificationId
          ? { ...notification, read: true }
          : notification,
      ),
    );
    if (updatedNotification?.actionHref) {
      navigate(updatedNotification.actionHref);
      setNotificationOpen(false);
    }
  }

  function handleRoleChange(nextRole) {
    setRole(nextRole);
    const nextRoleLabel = nextRole === ROLES.ADMIN ? "Admin" : "User";
    onSimulatedAction(`Simulated: switched to ${nextRoleLabel} role.`);
  }

  const showRoleSwitcher = import.meta.env.DEV && !isRealAuthMode;

  return (
    <header className="flex min-h-16 items-center justify-between gap-3 border-b border-border bg-background px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger aria-label="Toggle navigation" />
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap">
            <BreadcrumbItem className="hidden sm:inline-flex">
              Logbook System
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden sm:inline-flex" />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="truncate">{pageTitle}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {showRoleSwitcher && (
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground lg:inline">
              Testing only
            </span>
            <Select value={role} onValueChange={handleRoleChange}>
              <SelectTrigger
                className="w-28 sm:w-32"
                aria-label="Switch simulated role"
              >
                <SelectValue>
                  {role === ROLES.ADMIN ? "Admin" : "User"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value={ROLES.ADMIN}>Admin</SelectItem>
                <SelectItem value={ROLES.USER}>User</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <ThemeToggle />

        <Popover open={notificationOpen} onOpenChange={setNotificationOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Notifications (simulated)"
                onClick={handleOpenNotifications}
                className="relative"
              >
                <Bell aria-hidden="true" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                    {unreadCount}
                  </span>
                )}
              </Button>
            }
          />
          <PopoverContent align="end" className="w-80 p-0">
            <PopoverHeader className="border-b border-border px-4 py-3">
              <PopoverTitle>Notifications</PopoverTitle>
            </PopoverHeader>
            <div className="max-h-80 overflow-y-auto px-2 py-2">
              {notifications.length === 0 ? (
                <p className="px-2 py-4 text-sm text-muted-foreground">
                  No notifications are available for this role.
                </p>
              ) : (
                <ul className="space-y-2">
                  {notifications.map((notification) => (
                    <li
                      key={notification.id}
                      className="rounded-xl border border-border bg-muted/20 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {notification.title}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {notification.message}
                          </p>
                          <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {new Intl.DateTimeFormat("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            }).format(new Date(notification.createdAt))}
                          </p>
                        </div>
                        {!notification.read && (
                          <span
                            className="mt-0.5 inline-flex h-2.5 w-2.5 rounded-full bg-primary"
                            aria-label="Unread notification"
                          />
                        )}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleDismissNotification(notification.id)
                          }
                        >
                          {notification.read ? "Opened" : "Mark read"}
                        </Button>
                        {notification.actionHref && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              navigate(notification.actionHref);
                              setNotificationOpen(false);
                            }}
                          >
                            {notification.actionLabel}
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md p-1.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
            <Avatar>
              <AvatarFallback>{user.initials}</AvatarFallback>
            </Avatar>
            <span className="hidden min-w-0 sm:block">
              <span className="block max-w-28 truncate text-sm font-medium">
                {user.name}
              </span>
              <span className="block text-xs text-muted-foreground">
                {user.title}
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className="hidden size-4 sm:block"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <span className="block truncate">{user.name}</span>
                <span className="font-normal text-muted-foreground">
                  {user.title}
                  {isRealAuthMode ? "" : " · Simulated"}
                </span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link to={profilePath} />}>
              My Profile
            </DropdownMenuItem>
            {role === ROLES.ADMIN && (
              <DropdownMenuItem render={<Link to={PATHS.settings} />}>
                Settings
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => {
                logout();
                onSimulatedAction("");
              }}
            >
              <LogOut aria-hidden="true" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
