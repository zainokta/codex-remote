import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: 'Codex Remote' },
      { name: 'theme-color', content: '#0f172a' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'manifest', href: '/manifest.json' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="app-shell">
          <header className="topbar">
            <div>
              <p className="eyebrow">Same-LAN Codex control</p>
              <h1>Codex Remote</h1>
            </div>
          </header>
          {children}
        </div>
        <Scripts />
      </body>
    </html>
  )
}
