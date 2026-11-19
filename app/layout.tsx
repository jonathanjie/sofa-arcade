import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sofa Arcade · Jon & Lydia's game night",
  description: "A collection of living-room games for one TV and two phones. Featuring Sofa Kingdoms and Lala the orange cat.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
