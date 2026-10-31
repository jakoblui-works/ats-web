import { defineConfig } from "orval";

// The client for this app's endpoints, generated from the prod spec (only its `ats` tag) and
// committed. CI regenerates it and fails if it differs, so it can't drift from the api.
export default defineConfig({
  ats: {
    input: {
      target: "https://jakoblui.com/api/openapi.json",
      filters: { tags: ["ats"] },
    },
    output: {
      mode: "tags-split",
      target: "src/api/generated/endpoints.ts",
      schemas: { path: "src/api/generated/model", type: "zod" },
      client: "react-query",
      httpClient: "fetch",
      baseUrl: "/api",
      clean: true,
      override: {
        // customFetch throws ApiError on any non-2xx (JSON or not) and validates success bodies
        // with the schema Orval passes in, so the generated types only describe success.
        mutator: { path: "src/api/fetcher.ts", name: "customFetch" },
        includeZodSchemaInArguments: true,
        fetch: { runtimeValidation: true, forceSuccessResponse: true },
      },
    },
  },
});
