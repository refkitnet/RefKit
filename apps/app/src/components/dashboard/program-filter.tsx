"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ProgramOption = {
  id: string;
  name: string;
  slug: string;
  destination_url?: string | null;
};

const ALL_VALUE = "__all__";

export function ProgramFilter({
  programs,
  value,
  onChange,
}: {
  programs: ProgramOption[];
  value: string;
  onChange: (programId: string) => void;
}) {
  if (programs.length <= 1) {
    return null;
  }

  return (
    <Select
      value={value || ALL_VALUE}
      onValueChange={(next) => onChange(next === ALL_VALUE ? "" : next)}
    >
      <SelectTrigger className="w-full sm:w-56">
        <SelectValue placeholder="All programs" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>All programs</SelectItem>
        {programs.map((program) => (
          <SelectItem key={program.id} value={program.id}>
            {program.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function programNameMap(programs: ProgramOption[]) {
  return new Map(programs.map((program) => [program.id, program.name]));
}
