import { ImportForm } from "@/components/import-form";

export default function ImportPage() {
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
    </div>
  );
}
