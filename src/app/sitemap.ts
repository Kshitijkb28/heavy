import type { MetadataRoute } from "next";
import { SITE } from "@/data/resume";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  // the build date: every publish from the in-page editor rebuilds the site
  return [{ url: SITE.url, lastModified: new Date(), changeFrequency: "monthly", priority: 1 }];
}
