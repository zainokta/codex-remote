import type { PendingApproval } from '@codex-remote/shared-types'

type ApprovalDecision = 'approve' | 'approve_once' | 'approve_always' | 'reject' | 'cancel'

type Props = {
  approvals: PendingApproval[]
  disabled: Record<string, boolean>
  onDecision: (requestId: string, decision: ApprovalDecision) => Promise<void>
}

export function ApprovalBar({ approvals, disabled, onDecision }: Props) {
  if (approvals.length === 0) return null

  return (
    <section className="approval-stack">
      {approvals.map((approval) => (
        <article key={approval.requestId} className="approval-card">
          <div>
            <p className="eyebrow">Approval needed</p>
            <h3>{approval.title}</h3>
            {approval.command ? <code>{approval.command}</code> : null}
            {approval.reason ? <p>{approval.reason}</p> : null}
            {approval.permissionsSummary?.map((line) => <p key={line}>{line}</p>)}
          </div>
          <div className="approval-actions">
            {approval.kind === 'file_change' ? (
              <>
                {(approval.availableDecisions ?? ['approve', 'approve_always', 'reject']).includes('approve') ? <button disabled={disabled[approval.requestId]} onClick={() => void onDecision(approval.requestId, 'approve')}>Approve change</button> : null}
                {(approval.availableDecisions ?? ['approve', 'approve_always', 'reject']).includes('approve_always') ? <button disabled={disabled[approval.requestId]} onClick={() => void onDecision(approval.requestId, 'approve_always')}>Allow for session</button> : null}
                {(approval.availableDecisions ?? ['approve', 'approve_always', 'reject']).includes('reject') ? <button className="ghost" disabled={disabled[approval.requestId]} onClick={() => void onDecision(approval.requestId, 'reject')}>Reject</button> : null}
                {(approval.availableDecisions ?? ['approve', 'approve_always', 'reject']).includes('cancel') ? <button className="ghost" disabled={disabled[approval.requestId]} onClick={() => void onDecision(approval.requestId, 'cancel')}>Cancel</button> : null}
              </>
            ) : approval.kind === 'permissions' ? (
              <>
                <button disabled={disabled[approval.requestId]} onClick={() => void onDecision(approval.requestId, 'approve_once')}>Grant once</button>
                <button disabled={disabled[approval.requestId]} onClick={() => void onDecision(approval.requestId, 'approve_always')}>Grant for session</button>
                <button className="ghost" disabled={disabled[approval.requestId]} onClick={() => void onDecision(approval.requestId, 'reject')}>Reject</button>
              </>
            ) : renderCommandActions(approval, disabled[approval.requestId], onDecision)}
          </div>
        </article>
      ))}
    </section>
  )
}


function renderCommandActions(approval: PendingApproval, isDisabled: boolean | undefined, onDecision: (requestId: string, decision: ApprovalDecision) => Promise<void>) {
  const allowed = approval.availableDecisions ?? ['approve_once', 'approve_always', 'reject']
  return (
    <>
      {allowed.includes('approve_once') ? <button disabled={isDisabled} onClick={() => void onDecision(approval.requestId, 'approve_once')}>Approve once</button> : null}
      {allowed.includes('approve_always') ? <button disabled={isDisabled} onClick={() => void onDecision(approval.requestId, 'approve_always')}>Always allow</button> : null}
      {allowed.includes('reject') ? <button className="ghost" disabled={isDisabled} onClick={() => void onDecision(approval.requestId, 'reject')}>Reject</button> : null}
      {allowed.includes('cancel') ? <button className="ghost" disabled={isDisabled} onClick={() => void onDecision(approval.requestId, 'cancel')}>Cancel</button> : null}
    </>
  )
}
