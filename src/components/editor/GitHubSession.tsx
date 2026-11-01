/**
 * Edit mode against the repository: sign in with a fine-grained token (kept for this tab unless you ask to be
 * remembered, sent only to api.github.com), start the draft from content.json at the branch head, publish it as one
 * commit (the Pages workflow deploys it) and follow the deploy run in the edit bar.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { content as built } from "@/data/resume";
import type { Content, ContentIssue } from "@/data/schema";
import { commitMessage, diffContent, type Change } from "@/lib/content-diff";
import { bytesToBase64, createGitHub, GitHubError, repoFromEnv, type GitHub } from "@/lib/github";
import { useEditor } from "@/store/editor";
import { DraftContext, type DraftApi } from "./fields";
import { EditBar } from "./EditBar";
import { EditorPanel } from "./EditorPanel";
import { exitEditMode } from "./EditorRoot";
import { followRun, type PublishStatus } from "./follow";
import { STORAGE, writeStorage } from "./slots";
import { clearToken, readToken, saveToken } from "./token";
import styles from "./editor.module.css";

const TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";

interface Props {
  onReady: (content: Content, commitSha: string) => void;
  api: DraftApi | null;
  changes: readonly Change[];
  issues: readonly ContentIssue[];
  resumeFile: File | null;
  children?: ReactNode;
}

/** A status line and the draft it describes: it gives way to the counts as soon as the draft changes. */
type Shown = { value: PublishStatus; draft: Content } | null;

const messageOf = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export function GitHubSession({ onReady, api, changes, issues, resumeFile, children }: Props) {
  const repo = useMemo(() => repoFromEnv(), []);
  const [token, setToken] = useState<string | null>(() => readToken());
  const [phase, setPhase] = useState<"signin" | "loading" | "ready">(token ? "loading" : "signin");
  /** a pasted token being checked (the dialog stays, busy) rather than a stored one loading quietly */
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [fileSha, setFileSha] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [status, setStatus] = useState<Shown>(null);
  const poll = useRef<AbortController | null>(null);
  const gh = useMemo<GitHub | null>(() => (token ? createGitHub(token, repo) : null), [token, repo]);

  useEffect(() => () => poll.current?.abort(), []);

  const load = useCallback(
    async (client: GitHub, fresh?: { token: string; remember: boolean }) => {
      setPhase("loading");
      try {
        const loaded = await client.loadContent();
        if (fresh) saveToken(fresh.token, fresh.remember);
        setFileSha(loaded.fileSha);
        onReady(loaded.content, loaded.commitSha);
        // the repo is ahead of this page: a publish is still on its way to the live site
        if (diffContent(built, loaded.content).length) setStatus({ value: { text: "The live site is still building your last publish" }, draft: loaded.content });
        setPhase("ready");
      } catch (e) {
        // a pasted token that failed, or a stored one GitHub no longer accepts, is dropped
        const rejected = !!fresh || (e instanceof GitHubError && e.kind === "auth");
        if (rejected) {
          if (!fresh) clearToken();
          setToken(null);
        }
        setSignInError(messageOf(e));
        setPhase("signin");
      } finally {
        setSigningIn(false);
      }
    },
    [onReady],
  );

  const started = useRef(false);
  useEffect(() => {
    if (started.current || !gh || phase !== "loading") return;
    started.current = true;
    void load(gh);
  }, [gh, load, phase]);

  const signOut = () => {
    clearToken();
    exitEditMode();
  };

  if (phase === "loading" && !signingIn) {
    return (
      <div className={styles.banner} role="status">
        <p>Loading your content from GitHub…</p>
      </div>
    );
  }
  if (phase !== "ready" || !api) {
    return (
      <SignIn
        repo={`${repo.owner}/${repo.repo}`}
        busy={phase === "loading"}
        error={signInError}
        onSubmit={(t, remember) => {
          setSignInError(null);
          setSigningIn(true);
          setToken(t);
          started.current = true;
          void load(createGitHub(t, repo), { token: t, remember });
        }}
      />
    );
  }

  const base = useEditor.getState();
  const canPublish = !publishing && issues.length === 0 && (changes.length > 0 || !!resumeFile);
  return (
    <DraftContext.Provider value={api}>
      <EditBar
        mode="github"
        changes={changes.length + (resumeFile ? 1 : 0)}
        issues={issues.length}
        status={status && status.draft === api.draft ? status.value : null}
        canPublish={canPublish}
        onPublish={() => setPublishing(true)}
        onExit={exitEditMode}
        onSignOut={signOut}
      />
      <EditorPanel />
      {children}
      {publishing && gh && base.baseSha && fileSha ? (
        <PublishDialog
          gh={gh}
          base={{ commitSha: base.baseSha, fileSha }}
          changes={changes}
          resumeFile={resumeFile}
          onClose={() => setPublishing(false)}
          onPublished={(commitSha, newFileSha) => {
            const { draft } = useEditor.getState();
            if (!draft) return;
            useEditor.getState().rebase(draft, commitSha);
            setFileSha(newFileSha);
            writeStorage(STORAGE.draft, null);
            setPublishing(false);
            // one run followed at a time; its line shows until the next edit
            poll.current?.abort();
            poll.current = new AbortController();
            followRun(gh, commitSha, (value) => setStatus({ value, draft }), poll.current.signal);
          }}
          onReload={() => {
            started.current = false;
            setPublishing(false);
            void load(gh);
          }}
        />
      ) : null}
    </DraftContext.Provider>
  );
}

function useModal(): React.RefObject<HTMLDialogElement | null> {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => {
      if (d?.open) d.close();
    };
  }, []);
  return ref;
}

function SignIn({ repo, busy, error, onSubmit }: { repo: string; busy: boolean; error: string | null; onSubmit: (token: string, remember: boolean) => void }) {
  const ref = useModal();
  const [value, setValue] = useState("");
  const [remember, setRemember] = useState(false);
  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby="editor-signin-title" onCancel={(e) => (busy ? e.preventDefault() : exitEditMode())}>
      <form
        className={styles.dialogBody}
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSubmit(value.trim(), remember);
        }}
      >
        <h2 id="editor-signin-title" className={styles.panelTitle}>
          Edit your portfolio
        </h2>
        <p className={styles.note}>
          Publishing commits your changes to <strong>{repo}</strong> and the site rebuilds itself. Sign in with a GitHub token:
        </p>
        <ol className={styles.changes}>
          <li>
            Open{" "}
            <a href={TOKEN_URL} target="_blank" rel="noopener noreferrer">
              GitHub → new fine-grained token
            </a>
            .
          </li>
          <li>
            Repository access: <strong>only {repo}</strong>.
          </li>
          <li>
            Permissions: <strong>Contents: Read and write</strong>; Actions: Read-only (optional, shows when the site is live).
          </li>
          <li>Expiration: 90 days is plenty. Generate, copy, paste it here.</li>
        </ol>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="editor-token">
            Token
          </label>
          <input
            id="editor-token"
            className={styles.input}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            placeholder="github_pat_…"
            aria-invalid={error ? true : undefined}
            aria-describedby="editor-token-msg"
            onChange={(e) => setValue(e.target.value)}
          />
          <p id="editor-token-msg" className={error ? styles.error : styles.hint}>
            {error ?? "Sent only to api.github.com. Kept for this tab until you close it or sign out."}
          </p>
        </div>
        <label className={styles.check}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember on this device
        </label>
        <p className={styles.hint}>
          Remembered tokens are readable by every page on this github.io address, your other Pages sites included. Leave it off on shared or public computers.
        </p>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.button} onClick={exitEditMode} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={busy || !value.trim()}>
            {busy ? "Checking…" : "Sign in"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function PublishDialog({
  gh,
  base,
  changes,
  resumeFile,
  onClose,
  onPublished,
  onReload,
}: {
  gh: GitHub;
  base: { commitSha: string; fileSha: string };
  changes: readonly Change[];
  resumeFile: File | null;
  onClose: () => void;
  onPublished: (commitSha: string, fileSha: string) => void;
  onReload: () => void;
}) {
  const ref = useModal();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);
  const message = commitMessage(changes, !!resumeFile);

  const publish = async () => {
    const { draft } = useEditor.getState();
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const resume = resumeFile ? { path: `public${draft.profile.resumePdf}`, base64: bytesToBase64(new Uint8Array(await resumeFile.arrayBuffer())) } : undefined;
      const done = await gh.publish({ base, draft, message, resume });
      onPublished(done.commitSha, done.fileSha);
    } catch (e) {
      setError({ message: messageOf(e), conflict: e instanceof GitHubError && e.kind === "conflict" });
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby="editor-publish-title" onCancel={(e) => (busy ? e.preventDefault() : onClose())}>
      <div className={styles.dialogBody}>
        <h2 id="editor-publish-title" className={styles.panelTitle}>
          Publish
        </h2>
        <ul className={styles.changes}>
          {changes.map((c, i) => (
            <li key={i}>{c.label}</li>
          ))}
          {resumeFile ? <li>Replaced the résumé PDF ({resumeFile.name})</li> : null}
        </ul>
        <p className={styles.note}>One commit to GitHub; the site rebuilds and is live in about two minutes. Everything stays in the repository&rsquo;s history.</p>
        {error ? (
          <p className={styles.error} role="alert">
            {error.message}
          </p>
        ) : null}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.button} onClick={onClose} disabled={busy}>
            Back to editing
          </button>
          {error?.conflict ? (
            <button type="button" className={`${styles.button} ${styles.danger}`} onClick={onReload}>
              Load the latest (your draft can be restored)
            </button>
          ) : null}
          <button type="button" className={`${styles.button} ${styles.primary}`} onClick={publish} disabled={busy}>
            {busy ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
