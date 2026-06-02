import { Marked, type TokenizerAndRendererExtension } from "marked";
import DOMPurify from "dompurify";

export interface RenderOptions {
  /**
   * Project path (`group/sub/repo`) used to resolve project-relative
   * `/uploads/...` image URLs. Optional: omit for content with no relative
   * attachments (e.g. notes rendered without project context).
   */
  projectPath?: string;
}

// GitLab upload secrets are 32 hex chars; matching the shape keeps the rewrite
// from touching unrelated URLs (and blocks path-traversal into the API :id).
const SECRET = "[0-9a-f]{32}";
const RELATIVE_UPLOAD = new RegExp(`^/uploads/${SECRET}/.+`, "i");
const PROJECT_UPLOAD = new RegExp(
  `^/-/project/(\\d+)(/uploads/${SECRET}/.+)$`,
  "i",
);

// GitLab serves attachment uploads behind auth, so a bare `/uploads/...` <img>
// 404s against the dev-server origin and a direct GitLab URL is cross-origin +
// unauthenticated. Route uploads through the same /gitlab proxy as the API
// (which attaches the token server-side); the REST uploads endpoint accepts a
// URL-encoded project path — or numeric id — as `:id`.
function rewriteUploadSrc(href: string, projectPath?: string): string {
  const byId = PROJECT_UPLOAD.exec(href);
  if (byId) {
    const [, id, uploadPath] = byId;
    return `/gitlab/v4/projects/${id}${uploadPath}`;
  }
  if (projectPath && RELATIVE_UPLOAD.test(href)) {
    return `/gitlab/v4/projects/${encodeURIComponent(projectPath)}${href}`;
  }
  return href;
}

// Pull width/height out of GitLab's `{width=1308 height=559}` attribute list.
// Accepts plain numbers, px, or percentages; ignores other attrs (e.g. `.class`).
function parseDimensions(attrs: string): { width?: string; height?: string } {
  const out: { width?: string; height?: string } = {};
  const re = /(?:^|\s)(width|height)\s*=\s*"?([\d.]+%?(?:px)?)"?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrs))) {
    out[m[1].toLowerCase() as "width" | "height"] = m[2];
  }
  return out;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Inline tokenizer for images that also consumes GitLab's trailing
// `{width=.. height=..}` attribute list — which standard Markdown leaves as
// literal text. Running at the inline-token level (not a regex over the raw
// source) means it correctly skips code spans and fenced blocks.
function gitlabImageExtension(
  projectPath?: string,
): TokenizerAndRendererExtension {
  const rule =
    /^!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+(?:"([^"]*)"|'([^']*)'))?\s*\)(?:\{([^}]*)\})?/;
  return {
    name: "gitlabImage",
    level: "inline",
    start(src: string) {
      const i = src.indexOf("![");
      return i < 0 ? undefined : i;
    },
    tokenizer(src: string) {
      const m = rule.exec(src);
      if (!m) return undefined;
      return {
        type: "gitlabImage",
        raw: m[0],
        alt: m[1] ?? "",
        href: m[2],
        title: m[3] ?? m[4] ?? "",
        attrs: m[5] ?? "",
      };
    },
    renderer(token) {
      const src = rewriteUploadSrc(token.href, projectPath);
      const { width, height } = parseDimensions(token.attrs);
      let html = `<img src="${escapeAttr(src)}" alt="${escapeAttr(token.alt)}"`;
      if (token.title) html += ` title="${escapeAttr(token.title)}"`;
      if (width) html += ` width="${escapeAttr(width)}"`;
      if (height) html += ` height="${escapeAttr(height)}"`;
      return html + ">";
    },
  };
}

// GitLab descriptions/notes are Markdown that may contain attacker-authored raw
// HTML. marked does not sanitize, and the dev-server proxy attaches the token to
// same-origin requests — so an unsanitized `<img onerror=fetch('/gitlab/...')>`
// could act as the user. Every rendered fragment goes through DOMPurify.
export function renderMarkdown(
  src: string | null | undefined,
  opts: RenderOptions = {},
): string {
  if (!src) return "";
  const marked = new Marked();
  marked.use({ extensions: [gitlabImageExtension(opts.projectPath)] });
  const html = marked.parse(src, { async: false }) as string;
  return DOMPurify.sanitize(html);
}
