
import React, { useEffect, useRef } from 'react';

interface ContentRendererProps {
  content: string;
}

const ContentRenderer: React.FC<ContentRendererProps> = ({ content }) => {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current && (window as any).marked) {
      // Use optional chaining and a type guard for MathJax
      const MathJax = (window as any).MathJax;
      
      // Sanitize and render markdown
      contentRef.current.innerHTML = (window as any).marked.parse(content || '', {
        gfm: true,
        breaks: true,
        sanitizer: (html: string) => html, // Use a proper sanitizer in production
      });
      
      // Typeset MathJax
      if (MathJax && typeof MathJax.typesetPromise === 'function') {
        MathJax.typesetPromise([contentRef.current]).catch((err: any) => console.error('MathJax typesetting error:', err));
      }
    }
  }, [content]);

  return <div ref={contentRef} className="prose prose-slate dark:prose-invert max-w-none"></div>;
};

export default ContentRenderer;
