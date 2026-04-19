type Props = {
  diff: string
}

export function DiffReviewSheet({ diff }: Props) {
  return (
    <details className="panel-card" open={Boolean(diff)}>
      <summary>Diff review</summary>
      {diff ? <pre className="diff-block">{diff}</pre> : <p>No diff for this session yet.</p>}
    </details>
  )
}
