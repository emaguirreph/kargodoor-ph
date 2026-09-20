import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KargoDoor PH",
    short_name: "KargoDoor",
    description: "Simple shipping from China to the Philippines.",
    start_url: "/",
    display: "standalone",
    background_color: "#eef8ff",
    theme_color: "#0753ad",
    icons: [
      {
        src: "/kargodoor-app-icon-v2.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
