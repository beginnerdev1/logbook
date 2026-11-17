import { Monitor, MoonStar, SunMedium } from "lucide-react";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: SunMedium },
  { value: "dark", label: "Dark", icon: MoonStar },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const activeTheme = resolvedTheme ?? theme ?? "system";
  const ActiveIcon =
    THEME_OPTIONS.find((option) => option.value === activeTheme)?.icon ??
    Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Choose theme"
            className="relative"
            title="Theme"
          >
            <ActiveIcon aria-hidden="true" className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-40">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
          const isSelected =
            value === "system" ? theme === "system" : theme === value;

          return (
            <DropdownMenuItem
              key={value}
              onClick={() => setTheme(value)}
              className={isSelected ? "bg-muted" : undefined}
              aria-pressed={isSelected}
            >
              <Icon aria-hidden="true" className="mr-2 size-4" />
              {label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
