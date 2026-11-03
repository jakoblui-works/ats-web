import type { ParseResult } from "@/parser/generated/parse-outcome";

// Made-up results in the parser's shape, for stories and tests. Nobody's real details.
export const readableResult: ParseResult = {
  visibility: "readable",
  page_count: 2,
  character_count: 3120,
  text: "Alex Example\nalex@example.com\n+00 000 000 000\n\nWork history\nSenior Engineer, Example Co\n2019 - 2024\n\nEducation\nBSc Computing, Example University\n2012 - 2015\n\nSkills\nPython, SQL",
  contact: {
    name: "Alex Example",
    email: "alex@example.com",
    phone: "+00 000 000 000",
    location: null,
    links: ["https://example.com/alex"],
  },
  sections: [
    { kind: "experience", heading: "Work history", text: "Senior Engineer, Example Co\n2019 - 2024" },
    { kind: "education", heading: "Education", text: "BSc Computing, Example University\n2012 - 2015" },
    { kind: "skills", heading: "Skills", text: "Python, SQL" },
  ],
  experience: [
    { title: "Senior Engineer", company: "Example Co", start: "Mar 2019", end: "Jun 2021", months: 28 },
    { title: null, company: null, start: "Feb 2016", end: "Feb 2017", months: 13 },
    { title: "Developer", company: null, start: "2012", end: "2014", months: 24 },
  ],
  experience_months: 65,
  education: [
    { qualification: "BSc Computing", institution: "Example University", start: "2012", end: "2015" },
    { qualification: null, institution: "Sample College", start: "2010", end: "2012" },
  ],
  skills: [],
  warnings: [],
};

export const partialResult: ParseResult = {
  ...readableResult,
  visibility: "partial",
  character_count: 640,
  contact: { name: null, email: null, phone: null, location: null, links: [] },
  experience: [],
  experience_months: null,
  education: [],
  sections: [
    { kind: "other", heading: "Work history", text: "Senior Engineer 2019" },
    { kind: "other", heading: "Interests", text: "" },
  ],
  warnings: ["little_text", "missing_contact", "missing_sections"],
};

export const invisibleResult: ParseResult = {
  visibility: "invisible",
  page_count: 1,
  character_count: 0,
  text: "",
  contact: { name: null, email: null, phone: null, location: null, links: [] },
  sections: [],
  experience: [],
  experience_months: null,
  education: [],
  skills: [],
  warnings: ["no_text_layer"],
};

/** A tiny one-page PDF, so stories have something to show in the frame. */
export const samplePdf = () =>
  new Blob(
    [
      "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
    ],
    { type: "application/pdf" },
  );
