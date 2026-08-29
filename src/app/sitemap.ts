import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";

const routes = ["", "/pricing", "/sample-report", "/get-started", "/about", "/contact"];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: `${siteConfig.url}${route}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}
