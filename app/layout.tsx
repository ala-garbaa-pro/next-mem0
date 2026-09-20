import type { Metadata } from "next";
import { Geist, Geist_Mono, Roboto, Noto_Sans } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

const notoSansHeading = Noto_Sans({ subsets: ["latin"], variable: "--font-heading" });
const roboto = Roboto({ subsets: ["latin"], variable: "--font-sans" });
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "next-mem0 — local AI memory",
  description: "Your AI conversation history, stored in your own Postgres with pgvector.",
  manifest: "/logo/favicon/site.webmanifest",
  icons: {
    icon: [
      { url: "/logo/favicon/favicon.ico", sizes: "any" },
      { url: "/logo/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/logo/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/logo/favicon/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/logo/favicon/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/logo/favicon/favicon.ico",
    apple: { url: "/logo/favicon/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
};

// Everything reads from the database at request time.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
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
            {children}
          </div>
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
