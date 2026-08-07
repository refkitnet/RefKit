import type { LucideIcon } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

type EntityListEmptyProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
};

export function EntityListEmpty({
  icon: Icon,
  title,
  description,
}: EntityListEmptyProps) {
  return (
    <Empty className="border border-dashed border-border/70 p-8 md:p-10">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
    </Empty>
  );
}
