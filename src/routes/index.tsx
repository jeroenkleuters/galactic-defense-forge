import { createFileRoute } from "@tanstack/react-router";
import { TowerDefense } from "../components/TowerDefense";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Outer Rim Defense — Space Tower Defense Prototype" },
      {
        name: "description",
        content:
          "Deploy turbolasers, ion cannons and tractor beams to hold a starfighter hyperlane against 12 waves of imperial hostiles.",
      },
      { property: "og:title", content: "Outer Rim Defense — Space Tower Defense" },
      {
        property: "og:description",
        content: "A browser tower defense prototype set in a star-strewn outer rim sector.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background px-4 py-6 lg:px-10">
      <header className="mx-auto mb-6 max-w-[1400px]">
        <p className="font-mono text-[11px] uppercase tracking-[0.4em] text-hologram/70">
          Sector 7 · Outer Rim
        </p>
        <h1 className="font-display text-3xl tracking-[0.15em] text-foreground sm:text-4xl">
          OUTER RIM DEFENSE
        </h1>
      </header>
      <div className="mx-auto max-w-[1400px]">
        <TowerDefense />
      </div>
    </main>
  );
}
