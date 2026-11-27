import { CircleHelp, Coins, Globe, Layers, Play, Sparkle, VolumeX } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

const facts = [
  { label: '$20 budget', detail: 'Per player', icon: Coins, color: 'gold' },
  { label: '5 picks', detail: 'Build your lineup', icon: Layers, color: 'violet' },
  { label: 'No talking', detail: 'Keep your bids secret', icon: VolumeX, color: 'cyan' },
] as const

type HomeScreenProps = {
  onStart: () => void
  onShowRules: () => void
}

export function HomeScreen({ onStart, onShowRules }: HomeScreenProps) {
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero__copy">
          <p className="mode-label"><span aria-hidden="true" /> Local Secret Bid</p>
          <h1 id="hero-title">Build your<br className="hero__break" /> <em>dream lineup.</em></h1>
          <p className="hero__description">
            Two players share one device and bid in secret on mystery cards.
            Make every dollar count.
          </p>
          <div className="hero__actions">
            <Button onClick={onStart}>
              <Play size={18} fill="currentColor" aria-hidden="true" /> Start Local Game
            </Button>
            <Button variant="secondary" onClick={onShowRules} aria-haspopup="dialog">
              <CircleHelp size={18} aria-hidden="true" /> How to Play
            </Button>
            <a className="button button--secondary" href="/online"><Globe size={18} aria-hidden="true" /> Play Online</a>
          </div>
        </div>

        <div className="deck-art" aria-hidden="true">
          <div className="deck-art__orbit" />
          <Sparkle className="deck-art__spark deck-art__spark--top" size={34} />
          <Sparkle className="deck-art__spark deck-art__spark--bottom" size={24} />
          <Sparkle className="deck-art__spark deck-art__spark--left" size={16} />
          <div className="deck-card deck-card--cyan"><VolumeX strokeWidth={1.25} /></div>
          <div className="deck-card deck-card--gold"><Coins strokeWidth={1.25} /></div>
          <div className="deck-card deck-card--mystery">
            <Sparkle className="deck-card__pip deck-card__pip--top" size={17} />
            <div className="deck-card__seal">?</div>
            <Sparkle className="deck-card__pip deck-card__pip--bottom" size={17} />
          </div>
        </div>
      </section>

      <Card className="facts">
        <ul aria-label="Match essentials" className="grid grid-cols-1 sm:grid-cols-3">
          {facts.map(({ label, detail, icon: Icon, color }) => (
            <li key={label} className="fact">
              <span className={`icon-tile icon-tile--${color}`}><Icon size={23} aria-hidden="true" /></span>
              <div><strong>{label}</strong><span>{detail}</span></div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}
