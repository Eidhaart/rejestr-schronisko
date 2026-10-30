import "./globals.css";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter" });

export const metadata = {
  title: process.env.ORG_NAME || "Rejestr schroniska",
  description: "Ewidencja zwierząt w schronisku – leczenie, profilaktyka, adopcje",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0d9488",
};

// Apply saved theme before first paint to avoid a flash.
const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="pl" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased bg-stone-100 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
        {children}
      </body>
    </html>
  );
}
