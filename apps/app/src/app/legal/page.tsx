import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { RefKitMark } from "@/components/brand/refkit-mark";
import { getBuildIdentity } from "@/lib/runtime-metadata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Source and legal notices | RefKit",
};

const legalDocuments = [
  { name: "License", path: "LICENSE" },
  { name: "Repository license map", path: "LICENSES.md" },
  { name: "Notices", path: "NOTICE" },
  { name: "Third-party notices", path: "THIRD_PARTY_NOTICES.md" },
  { name: "Trademark policy", path: "TRADEMARKS.md" },
] as const;

export default function LegalPage() {
  const build = getBuildIdentity();
  const sourceRoot = build.source_url.replace(/\/$/, "");

  return (
    <main className="min-h-svh bg-muted px-6 py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <RefKitMark href="/" />

        <section className="rounded-xl border border-border/70 bg-card p-6 shadow-sm">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Source and legal notices
            </h1>
            <p className="text-sm text-muted-foreground">
              This RefKit build is licensed under AGPL-3.0-only.
            </p>
          </div>

          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-[8rem_1fr]">
            <dt className="font-medium">Version</dt>
            <dd className="break-all font-mono text-muted-foreground">
              {build.version}
            </dd>
            <dt className="font-medium">Revision</dt>
            <dd className="break-all font-mono text-muted-foreground">
              {build.revision}
            </dd>
            <dt className="font-medium">Source</dt>
            <dd>
              <a
                href={build.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 break-all text-primary underline-offset-4 hover:underline"
              >
                Corresponding Source
                <ExternalLink className="size-3.5 shrink-0" />
              </a>
            </dd>
          </dl>

          <div className="mt-6 border-t border-border/70 pt-5">
            <h2 className="font-medium">Legal documents</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {legalDocuments.map((document) => (
                <li key={document.path}>
                  <a
                    href={`${sourceRoot}/${document.path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                  >
                    {document.name}
                    <ExternalLink className="size-3.5" />
                  </a>
                </li>
              ))}
              <li>
                <a
                  href="/third-party-notices.txt"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                >
                  Distributed third-party notices
                  <ExternalLink className="size-3.5" />
                </a>
              </li>
            </ul>
          </div>
        </section>

        <Link
          href="/sign-in"
          className="self-start text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Return to sign in
        </Link>
      </div>
    </main>
  );
}
