import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SnowOverlay } from "./components/snow-overlay";
import "./globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "Santa's World Delivery",
    description: "Fly Santa across a world map and ask an AI desk for kid addresses.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
                {children}
                <SnowOverlay />
            </body>
        </html>
    );
}
