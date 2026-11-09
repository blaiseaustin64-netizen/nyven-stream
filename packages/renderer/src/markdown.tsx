/**
 * Lightweight, dependency-free Markdown renderer.
 * Escapes HTML by default; only emits safe React elements.
 * Supports: headings, paragraphs, bold/italic, lists, links, blockquotes,
 * tables, fenced code, inline code. No raw HTML / scripts.
 */

import React, { memo, useMemo } from "react";
import { parseMarkdownBlocks } from "./markdown-parse";

function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inline: code, bold, italic, links — order matters */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split by inline code first
  const parts = text.split(/(`[^`]+`)/g);
  let k = 0;
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      nodes.push(
        <code
          key={`${keyPrefix}-c-${k++}`}
          className="ns-md-inline-code px-1.5 py-0.5 rounded bg-black/40 text-nyven-300 text-[0.9em] font-mono"
        >
          {part.slice(1, -1)}
        </code>
      );
      continue;
    }
    // links [text](url)
    const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    const seg = part;
    while ((m = linkRe.exec(seg)) !== null) {
      if (m.index > last) {
        nodes.push(...styleText(seg.slice(last, m.index), `${keyPrefix}-${k++}`));
      }
      nodes.push(
        <a
          key={`${keyPrefix}-a-${k++}`}
          href={m[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-nyven-400 underline underline-offset-2 hover:text-nyven-300"
        >
          {m[1]}
        </a>
      );
      last = m.index + m[0].length;
    }
    if (last < seg.length) {
      nodes.push(...styleText(seg.slice(last), `${keyPrefix}-${k++}`));
    }
  }
  return nodes;
}

function styleText(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // **bold** and *italic*
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(text.slice(last, m.index));
    }
    const token = m[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${k++}`} className="font-semibold text-slate-100">
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      nodes.push(
        <em key={`${keyPrefix}-i-${k++}`} className="italic text-slate-200">
          {token.slice(1, -1)}
        </em>
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const headingTag = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

export const SafeMarkdown = memo(function SafeMarkdown({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const blocks = useMemo(() => parseMarkdownBlocks(text), [text]);

  return (
    <div className={`ns-md prose-invert max-w-none ${className}`}>
      {blocks.map((b, idx) => {
        const key = `b-${idx}`;
        switch (b.type) {
          case "heading": {
            const Tag = headingTag[Math.min(b.level, 6) - 1];
            const sizes = [
              "text-xl font-semibold",
              "text-lg font-semibold",
              "text-base font-semibold",
              "text-sm font-semibold",
              "text-sm font-medium",
              "text-sm font-medium",
            ];
            return (
              <Tag
                key={key}
                className={`${sizes[b.level - 1]} text-slate-100 mt-3 mb-1.5 first:mt-0`}
              >
                {renderInline(b.text, key)}
              </Tag>
            );
          }
          case "paragraph":
            return (
              <p key={key} className="text-[15px] leading-relaxed text-slate-200 my-2 first:mt-0">
                {renderInline(b.text, key)}
              </p>
            );
          case "code":
            return (
              <pre
                key={key}
                className="ns-md-code my-3 overflow-x-auto rounded-lg bg-black/50 border border-slate-800 p-3 text-[13px] leading-relaxed font-mono text-slate-200"
              >
                {b.lang && (
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
                    {b.lang}
                  </div>
                )}
                <code>{b.code}</code>
              </pre>
            );
          case "quote":
            return (
              <blockquote
                key={key}
                className="border-l-2 border-nyven-500/50 pl-3 my-2 text-slate-400 italic"
              >
                {renderInline(b.text, key)}
              </blockquote>
            );
          case "ul":
            return (
              <ul key={key} className="list-disc pl-5 my-2 space-y-1 text-slate-200">
                {b.items.map((it, j) => (
                  <li key={`${key}-${j}`}>{renderInline(it, `${key}-${j}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} className="list-decimal pl-5 my-2 space-y-1 text-slate-200">
                {b.items.map((it, j) => (
                  <li key={`${key}-${j}`}>{renderInline(it, `${key}-${j}`)}</li>
                ))}
              </ol>
            );
          case "table":
            return (
              <div key={key} className="overflow-x-auto my-3">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      {b.headers.map((h, j) => (
                        <th
                          key={j}
                          className="border border-slate-700 bg-slate-800/50 px-2 py-1.5 text-left text-slate-300 font-medium"
                        >
                          {renderInline(h, `${key}-h-${j}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            className="border border-slate-800 px-2 py-1.5 text-slate-300"
                          >
                            {renderInline(cell, `${key}-c-${ri}-${ci}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "hr":
            return <hr key={key} className="border-slate-800 my-4" />;
          default:
            return null;
        }
      })}
    </div>
  );
});

// silence unused in case tree-shaking
void escapeText;
