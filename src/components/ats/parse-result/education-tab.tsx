import type { ParseResultOutput } from "@/api/generated/model";

import { Missing } from "./missing";

export const EducationTab = ({ education }: { education: ParseResultOutput["education"] }) => {
  if (education.length === 0) return <Missing>No education found</Missing>;
  return (
    <ul className="flex flex-col gap-2">
      {education.map((entry, index) => (
        <li key={index} className="flex flex-col gap-0.5 rounded-md border bg-surface p-3">
          <span className="font-medium break-words">{entry.qualification || <Missing />}</span>
          <span className="text-sm break-words">{entry.institution || <Missing />}</span>
          <span className="text-sm text-muted-foreground">
            {entry.start || entry.end ? (
              <>
                {entry.start}
                {entry.start && entry.end && entry.start !== entry.end && ` to ${entry.end}`}
                {!entry.start && entry.end}
              </>
            ) : (
              <Missing />
            )}
          </span>
        </li>
      ))}
    </ul>
  );
};
