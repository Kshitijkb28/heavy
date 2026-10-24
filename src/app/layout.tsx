import type { Metadata, Viewport } from "next";
import { Anton, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SITE, links, profile } from "@/data/resume";
import { withBase } from "@/lib/base";
import { Providers } from "@/components/providers/Providers";
import { SkipLink } from "@/components/chrome/SkipLink";
import { TopBar } from "@/components/chrome/TopBar";
import { DollyRail } from "@/components/chrome/DollyRail";
import { StageSheet } from "@/components/chrome/StageSheet";
import { Toast } from "@/components/chrome/Toast";
import { Stage } from "@/components/scene/Stage";

const anton = Anton({ weight: "400", subsets: ["latin"], display: "swap", variable: "--font-anton", preload: true });
const geist = Geist({ subsets: ["latin"], display: "swap", variable: "--font-geist", preload: true });
const geistMono = Geist_Mono({ subsets: ["latin"], display: "swap", variable: "--font-geist-mono", preload: false });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: SITE.title,
  description: SITE.description,
  applicationName: "Kshitij Bhardwaj",
  authors: [{ name: profile.name, url: SITE.url }],
  creator: profile.name,
  keywords: ["Kshitij Bhardwaj", "Full Stack Developer", "Gurugram", "Python", "FastAPI", "React", "Laravel", "Node.js", "LLM"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "/",
    siteName: profile.name,
    title: SITE.title,
    description: SITE.description,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: `${profile.name} — ${profile.role}` }],
  },
  twitter: { card: "summary_large_image", title: SITE.title, description: SITE.description, images: ["/og.png"] },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#050507",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Runs before first paint: marks JS as present (reveal holds exist only then) and mirrors reduced motion. */
const PRE_PAINT_SCRIPT = `(function(){var d=document.documentElement;d.dataset.js='pending';d.dataset.motion=matchMedia('(prefers-reduced-motion: reduce)').matches?'calm':'full';})();`;

const personJsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: profile.name,
  jobTitle: profile.role,
  url: SITE.url,
  email: `mailto:${profile.email}`,
  address: { "@type": "PostalAddress", addressLocality: profile.city, addressCountry: "IN" },
  worksFor: { "@type": "Organization", name: profile.now.company, url: profile.now.href },
  sameAs: [links.linkedin.href, links.github.href, SITE.url],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anton.variable} ${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_SCRIPT }} />
        <SkipLink />
        <Providers>
          <TopBar resumeHref={withBase(profile.resumePdf)} />
          {children}
          <DollyRail />
          <StageSheet />
          <Stage />
          <Toast />
        </Providers>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }} />
      </body>
    </html>
  );
}
