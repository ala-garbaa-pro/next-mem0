import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative flex min-h-svh flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Link href="/" className="mb-6 flex items-center gap-2.5">
        <Image
          src="/logo/white-on-blue.png"
          alt="next-mem0"
          width={38}
          height={38}
          priority
          className="size-[38px] rounded-[12px] shadow-[0_6px_18px_rgba(10,124,255,0.28)]"
        />
        <span className="vivid-text-static font-heading text-lg font-semibold tracking-tight">next-mem0</span>
      </Link>
      {children}
    </main>
  );
}
