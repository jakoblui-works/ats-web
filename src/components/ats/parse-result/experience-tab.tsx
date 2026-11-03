import type { ParseResult } from "@/parser/generated/parse-outcome";

import { formatMonths, isYearOnly } from "./format-months";
import { Missing } from "./missing";

type ExperienceTabProps = Pick<ParseResult, "experience" | "experience_months">;

export const ExperienceTab = ({ experience, experience_months }: ExperienceTabProps) => {
  if (experience.length === 0) return <Missing>No jobs found</Missing>;
  const total = formatMonths(experience_months);
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {experience.map((job, index) => {
          const length = formatMonths(job.months);
          const about = isYearOnly(job.start) || isYearOnly(job.end);
          return (
            <li key={index} className="flex flex-col gap-0.5 rounded-md border bg-surface p-3">
              <span className="font-medium break-words">{job.title || <Missing />}</span>
              <span className="text-sm break-words">{job.company || <Missing />}</span>
              <span className="text-sm text-muted-foreground">
                {job.start || "?"} to {job.end || "?"}
                {length && `, ${about ? "about " : ""}${length}`}
              </span>
            </li>
          );
        })}
      </ul>
      {total && (
        <>
          <p className="text-sm font-medium">
            Total: {experience.some((job) => isYearOnly(job.start) || isYearOnly(job.end)) && "about "}
            {total}
          </p>
          <p className="text-sm text-muted-foreground">Jobs that overlap are counted once in the total.</p>
        </>
      )}
    </div>
  );
};
