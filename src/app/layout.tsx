import type { Metadata } from "next";
import { Inter, Pirata_One } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Police gothique, réservée aux titres de marque (menu, page de connexion).
const gothic = Pirata_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-gothic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lead Manager - Gestion des leads",
  description: "Plateforme de gestion des leads pour téléprospection",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const envScript =
    typeof window === "undefined"
      ? `window.__SUPABASE_ENV=${JSON.stringify({ url: supabaseUrl, anonKey: supabaseAnonKey })};`
      : "";

  return (
    <html lang="fr">
      <body className={`${inter.variable} ${gothic.variable} font-sans antialiased bg-[#f4f7fb] text-[#0b1f3a]`}>
        <script dangerouslySetInnerHTML={{ __html: envScript }} />
        {children}
      </body>
    </html>
  );
}
