import type { MouseEvent, ReactNode } from 'react'
import { CircleHelp, Layers, Volume2, VolumeX } from 'lucide-react'
import { Button } from './ui/Button'

type AppShellProps = {
  children: ReactNode
  onShowRules: () => void
  onShowPrivacy: () => void
  onHome: () => void
  sound?: { available: boolean; enabled: boolean; toggle: () => void }
  gamePage?: boolean
}

export function AppShell({ children, onShowRules, onShowPrivacy, onHome, sound, gamePage = false }: AppShellProps) {
  function goHome(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onHome()
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <div className="site-header__inner page-width">
          <a className="brand" href="/" aria-label="Bid Brawl home" onClick={goHome}>
            <span className="brand__mark"><Layers size={20} strokeWidth={2.5} aria-hidden="true" /></span>
            <span>Bid <span className="brand__accent">Brawl</span></span>
          </a>
          <nav className="site-nav" aria-label="Main">
            {sound?.available && (
              <Button variant="quiet" className="sound-toggle" aria-label="Sound effects" aria-pressed={sound.enabled}
                title={sound.enabled ? 'Mute sound effects' : 'Enable sound effects'} onClick={sound.toggle}>
                {sound.enabled ? <Volume2 size={19} aria-hidden="true" /> : <VolumeX size={19} aria-hidden="true" />}
              </Button>
            )}
            <Button variant="quiet" className="site-nav__rules" onClick={onShowRules} aria-haspopup="dialog" aria-label="How to Play">
              <CircleHelp size={17} aria-hidden="true" /> <span>How to Play</span>
            </Button>
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className={`page-width main-content${gamePage ? ' main-content--game' : ''}`}>{children}</main>
      <footer className="site-footer">
        <div className="page-width site-footer__inner">
          <span>Quick · Competitive · Funny</span>
          <div className="site-footer__links">
            <Button variant="quiet" onClick={onShowPrivacy} aria-haspopup="dialog">Privacy</Button>
          </div>
        </div>
      </footer>
    </div>
  )
}
