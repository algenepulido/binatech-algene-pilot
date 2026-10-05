// ============================================================
// ModelRoot — picks the right Model view for the open project:
//  - sample project  -> the built-in demo model (ModelView)
//  - real project w/ an uploaded model -> the IFC viewer (RealModelView)
//  - real project w/o a model yet -> an "upload your model" prompt
// ============================================================
import { useElements } from '../../lib/elements.jsx';
import { isSampleProject } from '../../lib/currentProject.js';
import { ModelView } from './ModelView.jsx';
import { RealModelView } from './RealModelView.jsx';
import { NoModelYet } from './NoModelYet.jsx';
import { COL } from '../../lib/theme.js';

export function ModelRoot(props) {
  const { usingModel, loading } = useElements();
  if (isSampleProject()) return <ModelView {...props} />;
  if (loading) return <div className="flex-1 flex items-center justify-center text-xs" style={{ color: COL.textMute }}>Loading project…</div>;
  if (usingModel) return <RealModelView {...props} />;
  return <NoModelYet t={props.t} lang={props.lang} onNavigate={props.onNavigate} />;
}
