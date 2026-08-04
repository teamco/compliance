import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

export function MarkdownViewer({ content, className }: MarkdownViewerProps) {
  return (
    <div className={cn('space-y-3 text-sm leading-relaxed text-foreground', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="text-sm leading-relaxed">{children}</p>,
          h1: ({ children }) => (
            <h1 className="text-lg font-semibold mt-4 mb-2 first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-semibold mt-4 mb-2 first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold mt-3 mb-1.5 first:mt-0">{children}</h3>
          ),
          ul: ({ children }) => <ul className="text-sm list-disc pl-5 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="text-sm list-decimal pl-5 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          code: ({ children, className: codeClassName }) =>
            codeClassName ? (
              <code className="block bg-muted border border-border rounded px-3 py-2 text-xs font-mono overflow-x-auto whitespace-pre">
                {children}
              </code>
            ) : (
              <code className="bg-muted border border-border rounded px-1 py-0.5 text-xs font-mono">
                {children}
              </code>
            ),
          pre: ({ children }) => (
            <pre className="bg-muted border border-border rounded px-3 py-2 text-xs font-mono overflow-x-auto whitespace-pre">
              {children}
            </pre>
          ),
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-green-500/50 pl-3 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-500 underline underline-offset-2 hover:text-green-400"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="border-border my-3" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
