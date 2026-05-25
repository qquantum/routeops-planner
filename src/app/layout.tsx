import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RouteOps Planner",
  description: "Route optimization and vendor delivery planning for logistics teams"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
