import { createRoot } from 'react-dom/client';

import { PreviewBar, type PreviewBarProps } from '@/dev/PreviewBar';

export function mountPreviewBar(props: PreviewBarProps): () => void {
  const el = document.body.appendChild(document.createElement('div'));
  const root = createRoot(el);
  root.render(<PreviewBar {...props} />);
  return () => {
    root.unmount();
    el.remove();
  };
}
