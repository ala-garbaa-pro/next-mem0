import { headers } from "next/headers";
import { CliSyncCard } from "@/components/cli-sync-card";
import { ImportForm } from "@/components/import-form";

/** The URL the sync program should log in to — this deployment, as the browser reached it. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function ImportPage() {
  const origin = await requestOrigin();
  return (
    <div className="animate-rise mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="font-heading text-[23px] leading-[30px] font-bold tracking-[-0.025em]">Import conversations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bring in your ChatGPT or Claude data export. Every message is embedded locally, so large exports take a
          moment.
        </p>
      </div>
      <ImportForm />

      <div className="hairline-x" />

      <CliSyncCard origin={origin} />
    </div>
  );
}
