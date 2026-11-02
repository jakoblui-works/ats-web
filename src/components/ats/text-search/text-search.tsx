import { Fragment, useId, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";

import { findMatches, MAX_TERM_LENGTH } from "./find-matches";

type TextSearchProps = { text: string };

const summary = (count: number) =>
  count === 0
    ? "A simple parser wouldn't find this"
    : `A simple parser would find this: ${count} ${count === 1 ? "match" : "matches"}`;

/** Searches the raw text for one term and shows the text with the matches marked. */
export const TextSearch = ({ text }: TextSearchProps) => {
  const [term, setTerm] = useState("");
  const inputId = useId();
  const matches = useMemo(() => findMatches(text, term), [text, term]);
  const searching = term.trim() !== "";

  const pieces: React.ReactNode[] = [];
  let at = 0;
  matches.forEach((match, index) => {
    pieces.push(<Fragment key={`t${index}`}>{text.slice(at, match.start)}</Fragment>);
    pieces.push(
      <mark key={`m${index}`} className="rounded-sm bg-primary-300 px-0.5 text-primary-950">
        {text.slice(match.start, match.end)}
      </mark>,
    );
    at = match.end;
  });
  pieces.push(<Fragment key="rest">{text.slice(at)}</Fragment>);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-sm font-medium">
          Search the text
        </label>
        <Input
          id={inputId}
          type="search"
          value={term}
          maxLength={MAX_TERM_LENGTH}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="A word or phrase from the job ad"
          autoComplete="off"
        />
        <p aria-live="polite" data-testid="search-result" className="min-h-5 text-sm text-muted-foreground">
          {searching && summary(matches.length)}
        </p>
      </div>
      <pre className="max-h-96 overflow-auto font-mono text-sm break-words whitespace-pre-wrap">{pieces}</pre>
    </div>
  );
};
