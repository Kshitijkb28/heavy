import type { ElementType, HTMLAttributes } from "react";
import clsx from "clsx";
import type { RevealMode } from "./reveal-core";

export type { RevealMode } from "./reveal-core";

export interface RevealProps extends HTMLAttributes<HTMLElement> {
  /** rendered tag (default div) */
  as?: "div" | "p" | "span" | "h2" | "h3" | "ul" | "ol" | "li" | "dl" | "blockquote" | "header" | "footer" | "section" | "article";
  /** how the block drops in: SplitText lines (default), words, chars, each child, or the whole block */
  mode?: RevealMode;
  /** ms before the drop starts once the block is triggered */
  delay?: number;
  /** ms between pieces (lines / words / children 40, chars 15) */
  stagger?: number;
  /** px the pieces fall (12) */
  distance?: number;
}

/**
 * Optional sugar over the `data-reveal` contract (U7): renders a `.hold` block that `MotionGate` drops into place. Plain
 * markup works just as well (`<p className="hold" data-reveal>`). No hooks, so it renders on the server.
 */
export function Reveal({ as = "div", mode = "lines", delay, stagger, distance, className, children, ...rest }: RevealProps) {
  const Tag = as as ElementType;
  return (
    <Tag {...rest} className={clsx("hold", className)} data-reveal={mode} data-reveal-delay={delay} data-reveal-stagger={stagger} data-reveal-distance={distance}>
      {children}
    </Tag>
  );
}
