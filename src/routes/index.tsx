import { createFileRoute } from "@tanstack/react-router";

import { AppHeader } from "@/components/app-header/app-header";

const HomePage = () => {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-16">
        <h1 className="font-heading text-4xl font-bold tracking-[-0.03em] sm:text-5xl">{ "Jakob Lui - ats-web" }</h1>
        <p className="mt-4 max-w-prose text-muted-foreground">{ "See what a simple ATS would extract from your CV" }</p>
      </main>
    </>
  );
};

export const Route = createFileRoute("/")({
  component: HomePage,
});
