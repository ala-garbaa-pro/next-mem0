import { getStats } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { BackupPanel } from "@/components/backup-panel";

export default async function BackupPage() {
  const user = await requireUser();
  const stats = await getStats(user.id).catch(() => null);

  return (
    <div className="animate-rise mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="font-heading text-[23px] leading-[30px] font-bold tracking-[-0.025em]">Backup</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Export everything in your store to one JSON file, or load such a file back in — for moving between
          machines, switching Postgres servers, or keeping a copy.
        </p>
      </div>
      <BackupPanel stats={stats} />
    </div>
  );
}
