import type { ParseResultOutput } from "@/api/generated/model";

// What the parser made of `public/sample-cv.pdf` (an invented CV), as the api returned it on 2026-11-02, so the
// example on the upload page matches the sample it offers. Regenerate it when the sample or the parser changes.
export const exampleResult: ParseResultOutput = {
  visibility: "readable",
  page_count: 1,
  character_count: 874,
  text: "Alex Example\nalex@example.com\n+44 20 7946 0123\nwww.example.com/alex\nPROFILE\nBackend developer with eight years of building web services and data pipelines, most recently\nleading a small team that moved a booking platform to the cloud.\nEXPERIENCE\nSenior Developer\nNorthwind Traders ApS\nMar 2021 - Present\nLed the move of the booking platform from on-premise servers to the cloud\nCut page load times by half by caching search results\nDeveloper\nExample Widgets Ltd\nAug 2017 - Feb 2021\nBuilt the order and invoicing services used by 300 shops\nIntroduced automated testing and code review\nSupport Team\nBluebird Lantern\nJun 2015 - Jul 2017\nAnswered customer questions and wrote the internal help pages\nEDUCATION\nMSc Computer Science\nExample University\n2013 - 2015\nBSc Mathematics\nExample University\n2010 - 2013\nSKILLS\nPython, TypeScript, PostgreSQL, Docker, AWS, automated testing",
  contact: {
    name: "Alex Example",
    email: "alex@example.com",
    phone: "+44 20 7946 0123",
    location: null,
    links: ["www.example.com/alex"],
  },
  sections: [
    {
      kind: "summary",
      heading: "PROFILE",
      text: "Backend developer with eight years of building web services and data pipelines, most recently\nleading a small team that moved a booking platform to the cloud.",
    },
    {
      kind: "experience",
      heading: "EXPERIENCE",
      text: "Senior Developer\nNorthwind Traders ApS\nMar 2021 - Present\nLed the move of the booking platform from on-premise servers to the cloud\nCut page load times by half by caching search results\nDeveloper\nExample Widgets Ltd\nAug 2017 - Feb 2021\nBuilt the order and invoicing services used by 300 shops\nIntroduced automated testing and code review\nSupport Team\nBluebird Lantern\nJun 2015 - Jul 2017\nAnswered customer questions and wrote the internal help pages",
    },
    {
      kind: "education",
      heading: "EDUCATION",
      text: "MSc Computer Science\nExample University\n2013 - 2015\nBSc Mathematics\nExample University\n2010 - 2013",
    },
    {
      kind: "skills",
      heading: "SKILLS",
      text: "Python, TypeScript, PostgreSQL, Docker, AWS, automated testing",
    },
  ],
  experience: [
    {
      title: "Senior Developer",
      company: "Northwind Traders ApS",
      start: "Mar 2021",
      end: "Present",
      months: 69,
    },
    {
      title: "Developer",
      company: "Example Widgets Ltd",
      start: "Aug 2017",
      end: "Feb 2021",
      months: 43,
    },
    {
      title: null,
      company: null,
      start: "Jun 2015",
      end: "Jul 2017",
      months: 26,
    },
  ],
  experience_months: 138,
  education: [
    {
      institution: "Example University",
      qualification: "MSc Computer Science",
      start: "2013",
      end: "2015",
    },
    {
      institution: "Example University",
      qualification: "BSc Mathematics",
      start: "2010",
      end: "2013",
    },
  ],
  skills: [],
  warnings: [],
};
