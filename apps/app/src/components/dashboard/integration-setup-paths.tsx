"use client";

import Link from "next/link";
import { BookOpen, ChevronDown, ExternalLink, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyBlock } from "@/components/ui/copy-block";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  AGENT_INTEGRATION_GUIDE_URL,
  buildAgentIntegrationPrompt,
  MANUAL_INTEGRATION_GUIDE_URL,
} from "@/lib/integration-guides";

type IntegrationSetupPathsProps = {
  apiUrl: string;
  appId: string;
  programId: string;
  revenueSource: "stripe" | "api";
  setupMode: "test" | "production";
  cliCommand: string;
  environmentVariables?: string | null;
  environmentHint?: string;
  externalGuides?: boolean;
};

export function IntegrationSetupPaths({
  apiUrl,
  appId,
  programId,
  revenueSource,
  setupMode,
  cliCommand,
  environmentVariables,
  environmentHint,
  externalGuides = true,
}: IntegrationSetupPathsProps) {
  const agentPrompt = buildAgentIntegrationPrompt({
    apiUrl,
    appId,
    programId,
    revenueSource,
    setupMode,
    environmentVariables,
    includeExternalGuide: externalGuides,
  });

  return (
    <Tabs defaultValue="agent" className="w-full">
      <TabsList className="grid h-auto w-full grid-cols-2">
        <TabsTrigger value="agent" className="gap-2 py-2">
          <Terminal className="size-4" />
          Coding agents
        </TabsTrigger>
        <TabsTrigger value="manual" className="gap-2 py-2">
          <BookOpen className="size-4" />
          Manual setup
        </TabsTrigger>
      </TabsList>

      <TabsContent value="agent">
        <div className="flex flex-col gap-3 rounded-md bg-muted/30 p-3">
          <div>
            <p className="text-sm font-medium">Integration prompt</p>
            <p className="text-xs text-muted-foreground">
              Ready for Cursor, Claude Code, or Codex.
            </p>
          </div>

          <CopyBlock
            value={agentPrompt}
            ariaLabel="Copy integration prompt"
            wrap
            codeClassName="max-h-10 overflow-hidden break-words"
          />

          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 text-sm font-medium [&::-webkit-details-marker]:hidden">
              View full prompt
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>

            <div className="flex flex-col gap-3 pt-3">
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-background/55 p-3 font-mono text-xs text-foreground">{agentPrompt}</pre>

              {externalGuides ? (
                <Button variant="outline" className="w-fit" asChild>
                  <Link href={AGENT_INTEGRATION_GUIDE_URL} target="_blank">
                    Read the coding-agent guide
                    <ExternalLink />
                  </Link>
                </Button>
              ) : null}
            </div>
          </details>
        </div>
      </TabsContent>

      <TabsContent value="manual">
        <div className="flex flex-col gap-4 rounded-md bg-muted/30 p-3">
          <div>
            <p className="text-sm font-medium">Follow the REST-first guide</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {externalGuides
                ? "Examples for common server languages and cURL."
                : "Use the integration documentation supplied by this instance operator."}
            </p>
          </div>

          {externalGuides ? (
            <Button variant="outline" className="w-fit" asChild>
              <Link href={MANUAL_INTEGRATION_GUIDE_URL} target="_blank">
                Open manual instructions
                <ExternalLink />
              </Link>
            </Button>
          ) : null}

          {environmentVariables ? (
            <div className="flex flex-col gap-2">
              <Label>Environment variables</Label>
              <CopyBlock
                value={environmentVariables}
                ariaLabel="Copy environment variables"
              />
              {environmentHint ? (
                <p className="text-xs text-muted-foreground">
                  {environmentHint}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 pt-1">
            <Label className="flex items-center gap-2">
              <Terminal className="size-3.5 text-muted-foreground/70" />
              Optional CLI helper
            </Label>
            <p className="text-xs text-muted-foreground">
              Configures credentials and prints JavaScript next steps.
            </p>
            <CopyBlock value={cliCommand} ariaLabel="Copy CLI command" />
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
