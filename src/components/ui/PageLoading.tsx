/** Full-page spinner while code or the session loads. Matches the page background so there's no flash. */
export function PageLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-label={label}>
      <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-line border-t-primary" />
    </div>
  );
}
