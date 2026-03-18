import React from 'react';
import styles from './AIAssistant.module.scss';

interface MarkdownContentProps {
  content: string;
}

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; content: string }
  | { type: 'paragraph'; content: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; language?: string; content: string }
  | { type: 'blockquote'; lines: string[] };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInlineMarkdown(text: string): string {
  let html = escapeHtml(text);

  html = html.replace(/`([^`\n]+)`/g, '<code class="' + styles.inlineCode + '">$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
  );

  return html;
}

function parseBlocks(content: string): Block[] {
  const normalized = content.replace(/\r\n/g, '\n');
  const trimmedContent = normalized.trim();

  if (
    (trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) ||
    (trimmedContent.startsWith('[') && trimmedContent.endsWith(']'))
  ) {
    try {
      const parsed = JSON.parse(trimmedContent);
      return [
        {
          type: 'code',
          language: 'json',
          content: JSON.stringify(parsed, null, 2),
        },
      ];
    } catch {
      // Fall through to normal markdown parsing.
    }
  }

  const lines = normalized.split('\n');
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim() || undefined;
      index += 1;
      const codeLines: string[] = [];

      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      blocks.push({
        type: 'code',
        language,
        content: codeLines.join('\n'),
      });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        content: headingMatch[2],
      });
      index += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];

      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }

      blocks.push({
        type: 'blockquote',
        lines: quoteLines,
      });
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.+)$/);
    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      const ordered = Boolean(orderedMatch);
      const items: string[] = [];

      while (index < lines.length) {
        const current = lines[index].trim();
        const currentMatch = ordered
          ? current.match(/^\d+\.\s+(.+)$/)
          : current.match(/^[-*]\s+(.+)$/);

        if (!currentMatch) {
          break;
        }

        items.push(currentMatch[1]);
        index += 1;
      }

      blocks.push({
        type: 'list',
        ordered,
        items,
      });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      const current = lines[index].trim();
      if (
        current.startsWith('```') ||
        current.startsWith('>') ||
        /^#{1,3}\s+/.test(current) ||
        /^[-*]\s+/.test(current) ||
        /^\d+\.\s+/.test(current)
      ) {
        break;
      }
      paragraphLines.push(current);
      index += 1;
    }

    if (paragraphLines.length > 0) {
      blocks.push({
        type: 'paragraph',
        content: paragraphLines.join(' '),
      });
      continue;
    }

    index += 1;
  }

  return blocks;
}

export const MarkdownContent: React.FC<MarkdownContentProps> = ({ content }) => {
  const blocks = parseBlocks(content);

  return (
    <div className={styles.markdownContent}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const className =
            block.level === 1
              ? styles.heading1
              : block.level === 2
                ? styles.heading2
                : styles.heading3;

          return (
            <div
              key={`heading-${index}`}
              className={className}
              dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(block.content) }}
            />
          );
        }

        if (block.type === 'paragraph') {
          return (
            <p
              key={`paragraph-${index}`}
              className={styles.paragraph}
              dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(block.content) }}
            />
          );
        }

        if (block.type === 'blockquote') {
          return (
            <blockquote key={`quote-${index}`} className={styles.blockquote}>
              {block.lines.map((line, lineIndex) => (
                <p
                  key={`quote-line-${lineIndex}`}
                  className={styles.blockquoteLine}
                  dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(line) }}
                />
              ))}
            </blockquote>
          );
        }

        if (block.type === 'code') {
          return (
            <div key={`code-${index}`} className={styles.codeBlock}>
              {block.language && <div className={styles.codeLanguage}>{block.language}</div>}
              <pre className={styles.codePre}>
                <code>{block.content}</code>
              </pre>
            </div>
          );
        }

        const ListTag = block.ordered ? 'ol' : 'ul';
        return (
          <ListTag key={`list-${index}`} className={styles.list}>
            {block.items.map((item, itemIndex) => (
              <li
                key={`item-${itemIndex}`}
                className={styles.listItem}
                dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(item) }}
              />
            ))}
          </ListTag>
        );
      })}
    </div>
  );
};
