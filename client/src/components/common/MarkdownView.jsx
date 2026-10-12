import { useState } from 'react';
import { FiCopy, FiCheck } from 'react-icons/fi';

export default function MarkdownView({ content = '', className = '', style = {} }) {
  if (!content) return null;

  const renderContent = (rawText) => {
    // Split by code blocks first
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(rawText)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: rawText.substring(lastIndex, match.index),
        });
      }

      parts.push({
        type: 'codeblock',
        language: match[1]?.trim() || 'code',
        code: match[2]?.trimEnd() || '',
      });

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < rawText.length) {
      parts.push({
        type: 'text',
        content: rawText.substring(lastIndex),
      });
    }

    return parts.map((part, index) => {
      if (part.type === 'codeblock') {
        return <CodeBlock key={index} language={part.language} code={part.code} />;
      }
      return <TextSection key={index} text={part.content} />;
    });
  };

  return (
    <div className={`markdown-view ${className}`} style={{ lineHeight: 1.6, color: 'var(--text-normal)', ...style }}>
      {renderContent(content)}
    </div>
  );
}

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        margin: '12px 0',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#111215',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
        fontSize: 13,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 12px',
          background: 'rgba(255, 255, 255, 0.04)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          color: 'var(--text-muted)',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        <span>{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            background: 'none',
            border: 'none',
            color: copied ? 'var(--discord-green)' : 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: 4,
          }}
          title="Copy code to clipboard"
        >
          {copied ? <FiCheck size={12} /> : <FiCopy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div style={{ padding: '12px 14px', overflowX: 'auto', maxHeight: 420 }}>
        <pre style={{ margin: 0, color: '#e6edf3', whiteSpace: 'pre' }}>
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

function TextSection({ text }) {
  const lines = text.split('\n');

  return (
    <>
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        // Headers
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={idx} style={{ fontSize: 15, fontWeight: 700, margin: '14px 0 6px', color: 'var(--text-heading)' }}>
              {renderInline(trimmed.substring(4))}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={idx} style={{ fontSize: 17, fontWeight: 700, margin: '16px 0 8px', color: 'var(--text-heading)' }}>
              {renderInline(trimmed.substring(3))}
            </h3>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={idx} style={{ fontSize: 19, fontWeight: 800, margin: '18px 0 10px', color: 'var(--text-heading)' }}>
              {renderInline(trimmed.substring(2))}
            </h2>
          );
        }

        // Blockquotes
        if (trimmed.startsWith('> ')) {
          return (
            <blockquote
              key={idx}
              style={{
                margin: '8px 0',
                padding: '6px 12px',
                borderLeft: '3px solid var(--discord-blurple)',
                background: 'rgba(88, 101, 242, 0.08)',
                color: 'var(--text-muted)',
                borderRadius: '0 4px 4px 0',
                fontSize: 13,
              }}
            >
              {renderInline(trimmed.substring(2))}
            </blockquote>
          );
        }

        // Unordered List Items
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={idx} style={{ display: 'flex', gap: 6, margin: '4px 0', paddingLeft: 8 }}>
              <span style={{ color: 'var(--discord-blurple)' }}>•</span>
              <div>{renderInline(trimmed.substring(2))}</div>
            </div>
          );
        }

        // Blank lines
        if (!trimmed) {
          return <div key={idx} style={{ height: 6 }} />;
        }

        // Regular Paragraph Line
        return (
          <p key={idx} style={{ margin: '4px 0' }}>
            {renderInline(line)}
          </p>
        );
      })}
    </>
  );
}

function renderInline(str) {
  if (!str) return '';

  // Parse inline elements: `code`, **bold**, *italic*, [text](url)
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(str)) !== null) {
    if (match.index > lastIndex) {
      parts.push(str.substring(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={match.index}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            color: '#f0883e',
            padding: '2px 5px',
            borderRadius: 4,
            fontSize: '0.9em',
            fontFamily: 'Consolas, Monaco, monospace',
          }}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(<em key={match.index}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('[') && token.includes('](')) {
      const closingBracket = token.indexOf('](');
      const label = token.slice(1, closingBracket);
      const url = token.slice(closingBracket + 2, -1);
      parts.push(
        <a
          key={match.index}
          href={url}
          target="_blank"
          rel="noreferrer"
          style={{ color: 'var(--discord-blurple)', textDecoration: 'underline' }}
          onClick={(e) => e.stopPropagation()}
        >
          {label}
        </a>
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < str.length) {
    parts.push(str.substring(lastIndex));
  }

  return parts.length > 0 ? parts : str;
}
