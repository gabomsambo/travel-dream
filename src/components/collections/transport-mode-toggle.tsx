"use client";

import { Button } from "@/components/ui/button";
import { Car, Footprints } from "lucide-react";

interface TransportModeToggleProps {
  value: "drive" | "walk";
  onChange: (mode: "drive" | "walk") => void;
}

export function TransportModeToggle({ value, onChange }: TransportModeToggleProps) {
  return (
    <div className="flex items-center gap-1 border rounded-lg p-1">
      <Button
        variant={value === "drive" ? "default" : "ghost"}
        size="sm"
        onClick={() => onChange("drive")}
        className="gap-2"
      >
        <Car className="h-4 w-4" />
        Drive
      </Button>
      <Button
        variant={value === "walk" ? "default" : "ghost"}
        size="sm"
        onClick={() => onChange("walk")}
        className="gap-2"
      >
        <Footprints className="h-4 w-4" />
        Walk
      </Button>
    </div>
  );
}
