import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";

// Combo tipográfico 1 (activo): Sora (títulos, geométrica elegante) + Inter (cuerpo/UI, máxima legibilidad).
// Combo 2 (alternativo, documentado en docs/planning/benchmark-fina-redesign.md):
// Space Grotesk (títulos) + IBM Plex Sans (cuerpo).
const inter = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const sora = Sora({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "SumiControl",
  description: "Plataforma interna de control administrativo para Sumigases y Sudematin.",
};

// Evita parpadeo de tema: aplica la preferencia guardada antes del primer paint.
const themeInit = `(function(){try{var t=localStorage.getItem('sumi-theme');if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} ${sora.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
