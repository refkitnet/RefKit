export function OnboardingFrame({
  appName,
  children,
}: {
  appName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Onboarding</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {appName ? `Set up ${appName}` : "Set up your affiliate program"}
        </h1>
      </div>

      {children}
    </div>
  );
}
