import { sha256 } from "@/lib/crypto";
import { getServerEnv } from "@/lib/env";

export function hashIp(ip: string): string {
  const env = getServerEnv();
  return sha256(`${ip}${env.IP_HASH_SALT}`);
}
