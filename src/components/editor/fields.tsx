/**
 * Form fields for the editor. Every field edits one value of the draft by path (`useDraft().set`) and shows the
 * validator's message for exactly that path, so what blocks a publish is shown where it is fixed.
 */
import { createContext, useContext, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Content, ContentIssue } from "@/data/schema";
import { insertAt, issuesUnder, moveItem, removeAt, type Path } from "./draft";
import styles from "./editor.module.css";

export interface DraftApi {
  draft: Content;
  issues: readonly ContentIssue[];
  set: (path: Path, value: unknown) => void;
}

export const DraftContext = createContext<DraftApi | null>(null);

export function useDraft(): DraftApi {
  const api = useContext(DraftContext);
  if (!api) throw new Error("editor fields need a DraftContext");
  return api;
}

/** ["experience", 0, "company"] → "experience[0].company" (the validator's path format). */
export function pathKey(path: Path): string {
  return path.reduce<string>((s, k) => (typeof k === "number" ? `${s}[${k}]` : s ? `${s}.${k}` : k), "");
}

export function valueAt(obj: unknown, path: Path): unknown {
  return path.reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string | number, unknown>)[k]), obj);
}

const errorAt = (issues: readonly ContentIssue[], path: Path) => issues.find((i) => i.path === pathKey(path))?.message;

function Message({ id, error, hint }: { id: string; error?: string; hint?: ReactNode }) {
  if (error) {
    return (
      <p id={`${id}-msg`} className={styles.error}>
        {error}
      </p>
    );
  }
  return hint ? (
    <p id={`${id}-msg`} className={styles.hint}>
      {hint}
    </p>
  ) : null;
}

interface TextProps {
  path: Path;
  label: string;
  /** the character limit (LIMITS.text): shown as a counter and enforced while typing */
  max?: number;
  hint?: ReactNode;
  placeholder?: string;
  multiline?: boolean;
  type?: "text" | "url" | "email" | "tel";
  /** an empty field removes the key (optional values that fall back to a derived one) */
  optional?: boolean;
  /** called with the raw input; the stored value is what it returns */
  normalise?: (value: string) => string;
}

export function TextField({ path, label, max, hint, placeholder, multiline, type = "text", optional, normalise }: TextProps) {
  const { draft, issues, set } = useDraft();
  const id = useId();
  const value = (valueAt(draft, path) as string | undefined) ?? "";
  const error = errorAt(issues, path);
  const common = {
    id,
    className: styles.input,
    value,
    maxLength: max,
    placeholder,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error || hint ? `${id}-msg` : undefined,
    onChange: (e: { target: { value: string } }) => {
      const v = normalise ? normalise(e.target.value) : e.target.value;
      set(path, optional && v === "" ? undefined : v);
    },
  };
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {max ? <span className={styles.counter}>{`${value.length}/${max}`}</span> : null}
      </label>
      {multiline ? (
        <textarea {...common} rows={3} />
      ) : (
        <input {...common} type={type} inputMode={type === "url" ? "url" : type === "email" ? "email" : type === "tel" ? "tel" : undefined} autoComplete="off" spellCheck={type === "text"} />
      )}
      <Message id={id} error={error} hint={hint} />
    </div>
  );
}

export function NumberField({ path, label, min, max, hint }: { path: Path; label: string; min: number; max: number; hint?: ReactNode }) {
  const { draft, issues, set } = useDraft();
  const id = useId();
  const value = valueAt(draft, path) as number;
  const error = errorAt(issues, path);
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={Number.isFinite(value) ? value : ""}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        onChange={(e) => set(path, e.target.value === "" ? Number.NaN : Number(e.target.value))}
      />
      <Message id={id} error={error} hint={hint} />
    </div>
  );
}

/** A month ("YYYY-MM"); with `allowPresent`, a "Present" box stores "present" instead. */
export function MonthField({ path, label, allowPresent }: { path: Path; label: string; allowPresent?: boolean }) {
  const { draft, issues, set } = useDraft();
  const id = useId();
  const value = (valueAt(draft, path) as string | undefined) ?? "";
  const present = value === "present";
  const error = errorAt(issues, path);
  const thisMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {present ? null : (
        <input
          id={id}
          className={styles.input}
          type="month"
          placeholder="YYYY-MM"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-msg` : undefined}
          onChange={(e) => set(path, e.target.value)}
        />
      )}
      {allowPresent ? (
        <label className={styles.check}>
          <input type="checkbox" checked={present} onChange={(e) => set(path, e.target.checked ? "present" : thisMonth())} />
          Present (ongoing)
        </label>
      ) : null}
      <Message id={id} error={error} />
    </div>
  );
}

/** A list of short strings as removable chips; Enter or a comma adds what is typed, Backspace on empty removes the last. */
export function TagsField({ path, label, max, maxLength, hint }: { path: Path; label: string; max: number; maxLength: number; hint?: ReactNode }) {
  const { draft, issues, set } = useDraft();
  const id = useId();
  const [text, setText] = useState("");
  const tags = (valueAt(draft, path) as string[] | undefined) ?? [];
  const own = issuesUnder(issues, pathKey(path));
  const listError = errorAt(issues, path);
  const add = () => {
    const parts = text
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!parts.length) return;
    set(path, [...tags, ...parts].slice(0, max));
    setText("");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !e.repeat && text === "" && tags.length) {
      // one chip per press: a held key must not empty the list
      set(path, tags.slice(0, -1));
    }
  };
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        <span className={styles.counter}>{`${tags.length}/${max}`}</span>
      </label>
      <div className={styles.tags} aria-invalid={own.length ? true : undefined}>
        {tags.map((tag, i) => (
          <span key={i} className={styles.tag} data-invalid={errorAt(issues, [...path, i]) ? "true" : undefined}>
            {tag || "(empty)"}
            <button type="button" className={styles.tagRemove} aria-label={`Remove ${tag || "empty tag"}`} onClick={() => set(path, removeAt(tags, i))}>
              ×
            </button>
          </span>
        ))}
        {tags.length < max ? (
          <input
            id={id}
            className={styles.tagInput}
            value={text}
            maxLength={maxLength}
            placeholder={tags.length ? "Add…" : "Type, then Enter"}
            aria-describedby={`${id}-msg`}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={add}
            enterKeyHint="done"
          />
        ) : null}
      </div>
      <Message id={id} error={listError ?? own[0]?.message} hint={hint ?? `Enter or comma to add, up to ${maxLength} characters each.`} />
    </div>
  );
}

interface ListProps<T> {
  path: Path;
  label: string;
  /** singular noun for the buttons: "role", "bullet" */
  noun: string;
  min: number;
  max: number;
  make: () => T;
  /** new items go first (newest-first lists) or last */
  addAt?: "start" | "end";
  title?: (item: T, index: number) => string;
  children: (item: T, index: number, itemPath: Path) => ReactNode;
}

/** React key of an entry: its id when it has one (state and focus follow it when the list reorders), else its place. */
const keyOf = (item: unknown, i: number) => (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string" ? `id:${(item as { id: string }).id}` : `at:${i}`);

/**
 * A list of entries as cards: Move up / down (focus stays with the moved entry), Remove with Undo (offered until this
 * list changes in any other way: an edit, a move, Discard), + Add.
 */
export function ListEditor<T>({ path, label, noun, min, max, make, addAt = "end", title, children }: ListProps<T>) {
  const { draft, issues, set } = useDraft();
  const items = (valueAt(draft, path) as T[] | undefined) ?? [];
  const [lastRemoval, setLastRemoval] = useState<{ index: number; item: T; after: readonly T[] } | null>(null);
  // the list is still exactly what the removal left: anything else (Discard included) makes Undo meaningless
  const removed = lastRemoval && lastRemoval.after === items ? lastRemoval : null;
  const listId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const listError = errorAt(issues, path);
  const move = (from: number, to: number, dir: "up" | "down") => {
    set(path, moveItem(items, from, to));
    // keep the keyboard on the entry that moved, wherever it went (index-keyed lists keep their DOM in place)
    requestAnimationFrame(() => {
      const at = (d: string) => listRef.current?.querySelector<HTMLButtonElement>(`button[data-list="${listId}"][data-index="${to}"][data-move="${d}"]`);
      const target = at(dir);
      (target && !target.disabled ? target : at(dir === "up" ? "down" : "up"))?.focus();
    });
  };
  const add = () => {
    setLastRemoval(null);
    set(path, insertAt(items, addAt === "start" ? 0 : items.length, make()));
  };
  const addButton = (
    <button type="button" className={styles.button} onClick={add} disabled={items.length >= max}>
      + Add {noun}
    </button>
  );
  return (
    <section className={styles.field} aria-label={label}>
      <div className={styles.listHead}>
        <span className={styles.label}>
          {label} <span className={styles.counter}>{`${items.length}/${max}`}</span>
        </span>
        {addAt === "start" ? addButton : null}
      </div>
      <ol ref={listRef} className={styles.list}>
        {items.map((item, i) => {
          const itemPath = [...path, i];
          const name = title?.(item, i) ?? "";
          const invalid = issuesUnder(issues, pathKey(itemPath)).length > 0;
          return (
            <li key={keyOf(item, i)}>
              {removed && removed.index === i ? <RemovedRow noun={noun} onUndo={() => undo(i)} /> : null}
              <div className={styles.card} data-invalid={invalid ? "true" : undefined}>
                <div className={styles.cardHead}>
                  {title ? (
                    <p className={styles.cardTitle} data-empty={name.trim() ? undefined : "true"}>
                      {name.trim() || `New ${noun}`}
                    </p>
                  ) : (
                    <span className={styles.cardTitle} aria-hidden="true" />
                  )}
                  <button
                    type="button"
                    className={`${styles.button} ${styles.icon} ${styles.quiet}`}
                    aria-label={`Move ${noun} ${i + 1} up`}
                    data-list={listId}
                    data-index={i}
                    data-move="up"
                    disabled={i === 0}
                    onClick={() => move(i, i - 1, "up")}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={`${styles.button} ${styles.icon} ${styles.quiet}`}
                    aria-label={`Move ${noun} ${i + 1} down`}
                    data-list={listId}
                    data-index={i}
                    data-move="down"
                    disabled={i === items.length - 1}
                    onClick={() => move(i, i + 1, "down")}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={`${styles.button} ${styles.icon} ${styles.quiet}`}
                    aria-label={`Remove ${noun} ${i + 1}`}
                    disabled={items.length <= min}
                    onClick={() => {
                      const after = removeAt(items, i);
                      setLastRemoval({ index: i, item, after });
                      set(path, after);
                    }}
                  >
                    ✕
                  </button>
                </div>
                {children(item, i, itemPath)}
              </div>
            </li>
          );
        })}
        {removed && removed.index >= items.length ? (
          <li>
            <RemovedRow noun={noun} onUndo={() => undo(items.length)} />
          </li>
        ) : null}
      </ol>
      {listError ? <p className={styles.error}>{listError}</p> : null}
      {addAt === "end" ? addButton : null}
    </section>
  );

  function undo(at: number) {
    if (!removed) return;
    set(path, insertAt(items, Math.min(at, items.length), removed.item));
    setLastRemoval(null);
  }
}

function RemovedRow({ noun, onUndo }: { noun: string; onUndo: () => void }) {
  return (
    <div className={styles.removed} role="status">
      <span>Removed the {noun}.</span>
      <button type="button" className={`${styles.button} ${styles.quiet}`} onClick={onUndo}>
        Undo
      </button>
    </div>
  );
}
