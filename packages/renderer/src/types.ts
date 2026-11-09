import type { StreamViewState } from "@nyven-stream/core";

export interface StreamViewProps {
  /** Derived stream state from @nyven-stream/core applyEvent / reduceEvents */
  state: StreamViewState;
  /** Called when user requests stop — host performs cancel */
  onCancel?: () => void;
  /** Initially expand the activity panel */
  defaultExpanded?: boolean;
  /** Controlled expand state */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Optional className on root */
  className?: string;
  /** Hide Stop button even when active */
  hideCancel?: boolean;
}
