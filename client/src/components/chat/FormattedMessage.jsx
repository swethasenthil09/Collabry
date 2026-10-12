import { useState } from 'react';

export default function FormattedMessage({ text }) {
  if (!text) return null;

  // Split by code blocks ```
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex, match.index),
      });
    }
    parts.push({
      type: 'code_block',
      lang: match[1] || 'plaintext',
      code: match[2].trim(),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.substring(lastIndex),
    });
  }

  const renderInlineFormatted = (rawText) => {
    // Regex for inline code, bold, links
    const tokens = rawText.split(/(`[^`]+`|\*\*[^*]+\*\*|https?:\/\/[^\s]+)/g);

    return tokens.map((token, idx) => {
      if (!token) return null;

      if (token.startsWith('`') && token.endsWith('`')) {
        return (
          <code key={idx} className="inline-code-badge">
            {token.slice(1, -1)}
          </code>
        );
      }

      if (token.startsWith('**') && token.endsWith('**')) {
        return (
          <strong key={idx} style={{ color: 'var(--text-heading)', fontWeight: 700 }}>
            {token.slice(2, -2)}
          </strong>
        );
      }

      if (token.match(/^https?:\/\//)) {
        return (
          <a
            key={idx}
            href={token}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--discord-blurple)', textDecoration: 'underline' }}
          >
            {token}
          </a>
        );
      }

      return <span key={idx}>{token}</span>;
    });
  };

  return (
    <div className="formatted-message-body">
      {parts.map((part, index) => {
        if (part.type === 'code_block') {
          return <CodeBlock key={index} lang={part.lang} code={part.code} />;
        }
        return (
          <div key={index} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
            {renderInlineFormatted(part.content)}
          </div>
        );
      })}
    </div>
  );
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-container">
      <div className="code-block-header">
        <span className="code-block-lang">{lang}</span>
        <button className="code-block-copy-btn" onClick={handleCopy}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre className="code-block-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}
