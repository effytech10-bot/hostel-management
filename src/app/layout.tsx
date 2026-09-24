import type { Metadata } from "next";
import { Hind_Siliguri, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const bangla = Hind_Siliguri({
  subsets: ["bengali"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-bangla",
});

export const metadata: Metadata = {
  title: { default: "Rangdhanu Hostel", template: "%s · Rangdhanu Hostel" },
  description: "Hostel management and accounting for Rangdhanu Chatrabash",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${bangla.variable} font-sans`}>{children}</body>
    </html>
  );
}
