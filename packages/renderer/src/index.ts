/**
 * @nyven-stream/renderer
 * Experience layer for NYVEN STREAM derived state.
 */

export { StreamView } from "./StreamView";
export { ActivityIndicator } from "./ActivityIndicator";
export { ActivityDetails } from "./ActivityDetails";
export { TaskTree } from "./TaskTree";
export { ToolList } from "./ToolList";
export { SourceList } from "./SourceList";
export { FileList } from "./FileList";
export { ContentArea } from "./ContentArea";
export { StreamControls } from "./StreamControls";
export { StatusDot, statusToTone } from "./StatusDot";

export type { StreamViewProps } from "./types";

export {
  deriveActivitySummary,
  shouldShowActivityIndicator,
  hasExpandableDetails,
  taskKindLabel,
  toolRunningLabel,
  toolCompletedLabel,
  fileStatusLabel,
  fileBasename,
  sourceDomain,
  sourceTitle,
  streamStatusLabel,
  activityLine,
} from "./labels";

export { SafeMarkdown } from "./markdown";

export { parseMarkdownBlocks } from "./markdown-parse";
