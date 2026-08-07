"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  getUserInitials,
  userDisplayLabel,
} from "@/lib/dashboard-display";
import { cn } from "@/lib/utils";

type UserDisplayProps = {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  link_code?: string | null;
  size?: "sm" | "default" | "lg";
  showName?: boolean;
  nameClassName?: string;
  className?: string;
};

export function UserDisplay({
  id,
  name,
  email,
  image,
  link_code,
  size = "default",
  showName = true,
  nameClassName,
  className,
}: UserDisplayProps) {
  const label = userDisplayLabel({ id, name, email, link_code });
  const initials = getUserInitials(email, name);

  const avatar = (
    <Avatar size={size} className={showName ? undefined : className}>
      {image ? <AvatarImage src={image} alt="" /> : null}
      <AvatarFallback className="bg-muted text-foreground">
        {initials}
      </AvatarFallback>
    </Avatar>
  );

  if (!showName) {
    return avatar;
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      {avatar}
      <span className={cn("truncate font-medium", nameClassName)}>
        {label}
      </span>
    </div>
  );
}
