"use client";

import { Check, Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownTrigger,
} from "@/components/ui/dropdown";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
] as const;

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const current =
    options.find((option) => option.value === theme) ?? options[2];
  const CurrentIcon = current.icon;

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change color theme">
          <CurrentIcon className="size-4" aria-hidden="true" />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end">
        <DropdownLabel>Appearance</DropdownLabel>
        {options.map(({ value, label, icon: Icon }) => (
          <DropdownItem key={value} onSelect={() => setTheme(value)}>
            <Icon className="size-4" aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {theme === value && (
              <Check className="size-3.5 text-primary" aria-hidden="true" />
            )}
          </DropdownItem>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}
