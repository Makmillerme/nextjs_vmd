import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Providers } from "@/components/layout";
import { ToastDismissOnInteraction } from "@/components/layout/toast-dismiss-on-interaction";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "VMD Parser",
  description: "Парсер ВМД з веб-інтерфейсом",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("NEXT_LOCALE")?.value;
  const htmlLang = localeCookie === "en" ? "en" : "uk";

  return (
    <html lang={htmlLang}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${jetbrainsMono.variable} font-sans antialiased h-dvh overflow-hidden`}
      >
        <TooltipProvider>
          <div className="flex h-full min-h-0 flex-col">
            <Providers>{children}</Providers>
            <ToastDismissOnInteraction />
            <Toaster
              richColors
              position="bottom-right"
              duration={3500}
              closeButton
              className="pointer-events-none [&_[data-sonner-toast]]:pointer-events-auto"
            />
          </div>
        </TooltipProvider>
      </body>
    </html>
  );
}
