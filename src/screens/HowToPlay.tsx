import { Layers, LockKeyhole, Sparkles } from 'lucide-react'
import { Card } from '../components/ui/Card'

const steps = [
  {
    title: 'Reveal a mystery item',
    detail: 'Flip the next card from a themed deck of 12. Both players see the current item. Future cards stay hidden.',
    icon: Sparkles,
    color: 'violet',
  },
  {
    title: 'Place private bids',
    detail: 'Take turns on the same device. Lock your bid or pass for $0, then hand it over. Once both bids are in, the higher bidder takes the card and pays their bid.',
    icon: LockKeyhole,
    color: 'cyan',
  },
  {
    title: 'Fill five slots and compare',
    detail: 'Start with $20 each and draft five items apiece. Stay silent during the draft, then compare lineups and decide who built the better one.',
    icon: Layers,
    color: 'gold',
  },
] as const

export function HowToPlay({ online = false }: { online?: boolean }) {
  return (
    <>
      <ol className="rules-steps" role="list">
        {steps.map(({ title, detail, icon: Icon, color }) => (
          <li key={title}>
            <Card className="rule-step">
              <span className={`icon-tile icon-tile--${color}`}><Icon size={21} aria-hidden="true" /></span>
              <div><h3>{title}</h3><p>{online && title === 'Place private bids'
                ? 'Both players bid privately on their own devices. Lock a bid within 15 seconds or pass for $0. The higher bidder takes the card and pays their bid.'
                : detail}</p></div>
            </Card>
          </li>
        ))}
      </ol>

      <details className="rules-details">
        <summary>Detailed rules</summary>
        <dl>
          <dt>What can I bid?</dt>
          <dd>The opening limit is $16. Always save $1 for each slot you would still need to fill after winning this card. Use whole dollars.</dd>
          <dt>What if bids tie?</dt>
          <dd>Player 1 starts with tie priority. When equal positive bids occur, the player with priority wins and priority switches.</dd>
          <dt>What if both players pass?</dt>
          <dd>
            If enough cards remain to fill all open slots after skipping this card, discard it for free. Up to two cards can be discarded.
            Otherwise, the player with more open slots gets it for $1 so both lineups can fill. Equal slots use a separate assignment priority that starts with Player 1 and switches after it breaks a tie.
          </dd>
          <dt>What if one lineup is full?</dt>
          <dd>Only the other player can bid or receive cards. If they pass, the same discard and $1 assignment rules apply.</dd>
        </dl>
      </details>
    </>
  )
}
