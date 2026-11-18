import { useEffect, useId, useRef, useState } from 'react';

export default function DescriptionPanel({ children, constrained = false }) {
  const panelRef = useRef(null);
  const contentRef = useRef(null);
  const [overflow, setOverflow] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();

  useEffect(() => {
    if (!constrained) return;
    const measure = () => {
      const panel = panelRef.current, content = contentRef.current;
      if (!panel || !content) return;
      const style = getComputedStyle(panel);
      const available = parseFloat(style.maxHeight) - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      setOverflow(content.scrollHeight > available + 1);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(panelRef.current);
    observer.observe(contentRef.current);
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [constrained]);

  return <aside ref={panelRef} className={`self-start border border-brown/15 bg-sand/35 p-7 md:p-9 ${constrained ? 'flex max-h-[calc(100svh-8rem)] flex-col' : ''}`}>
    <div id={contentId} style={constrained ? { scrollbarWidth: 'none' } : undefined} tabIndex={constrained && expanded ? 0 : undefined} role={constrained && expanded ? 'region' : undefined} aria-label={constrained && expanded ? 'Complete description and policies' : undefined} className={constrained ? `description-panel-content min-h-0 ${expanded ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden'}` : ''}>
      <div ref={contentRef}>{children}</div>
    </div>
    {constrained && overflow && <button type="button" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(value => !value)} className="mt-5 shrink-0 self-start border-b border-brown pb-1 text-sm">{expanded ? 'Read less' : 'Read all'}</button>}
  </aside>;
}
