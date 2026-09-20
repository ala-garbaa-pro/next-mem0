import type { Metadata } from "next";
import { Geist, Geist_Mono, Roboto, Noto_Sans } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { cn } from "@/lib/utils";
import { listConversations } from "@/lib/db";
import type { Conversation } from "@/lib/types";
import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "@/components/ui/sonner";

const notoSansHeading = Noto_Sans({ subsets: ["latin"], variable: "--font-heading" });
const roboto = Roboto({ subsets: ["latin"], variable: "--font-sans" });
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "mem0 — local AI memory",
  description: "Your AI conversation history, stored locally in a vector database.",
};

// Everything reads from the local database at request time.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  let conversations: Conversation[] = [];
  let dbError: string | null = null;
  try {
    conversations = await listConversations();
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "h-full antialiased font-sans",
        geistSans.variable,
        geistMono.variable,
        roboto.variable,
        notoSansHeading.variable,
      )}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <div className="relative flex min-h-svh overflow-clip">
            {/* aurora backdrop from the vivid design */}
            <div className="aurora -top-[220px] -left-[120px] size-[640px] [animation:aurora-a_16s_ease-in-out_infinite] [background:radial-gradient(circle,var(--aurora-a),transparent_62%)]" />
            <div className="aurora top-[80px] -right-[180px] size-[720px] [animation:aurora-b_20s_ease-in-out_infinite] [background:radial-gradient(circle,var(--aurora-b),transparent_62%)]" />
            <div className="aurora -bottom-[200px] left-[520px] size-[420px] [animation:aurora-a_24s_ease-in-out_infinite_reverse] [background:radial-gradient(circle,var(--aurora-c),transparent_65%)]" />
            <AppSidebar conversations={conversations} dbError={dbError} />
            <main className="relative min-w-0 flex-1">{children}</main>
          </div>
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
