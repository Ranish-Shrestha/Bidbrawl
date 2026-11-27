import { useEffect, useLayoutEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import { PrivacyHandoff } from './components/PrivacyHandoff'
import { Button } from './components/ui/Button'
import { Dialog } from './components/ui/Dialog'
import { categories } from './data/categories'
import { getMatchView, getRoundRef } from './game/selectors'
import { getShowdown } from './game/showdown'
import { useDraftSound } from './game/useDraftSound'
import { newMatchIdentity, useLocalMatch } from './game/useLocalMatch'
import type { PlayerId } from './game/types'
import { HomeScreen } from './screens/HomeScreen'
import { HowToPlay } from './screens/HowToPlay'
import { MatchScreen } from './screens/MatchScreen'
import { ResultsScreen } from './screens/ResultsScreen'
import { SetupScreen } from './screens/SetupScreen'

type EmptyPath = '/' | '/setup'

function readEmptyPath(): EmptyPath {
  return window.location.pathname === '/setup' ? '/setup' : '/'
}

export function App() {
  const { match, resume, dispatch, invalidSave, storageFailed } = useLocalMatch()
  const sound = useDraftSound(match)
  const [emptyPath, setEmptyPath] = useState(readEmptyPath)
  const [panel, setPanel] = useState<'rules' | 'exit' | 'privacy' | null>(null)
  const [veiledTurn, setVeiledTurn] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const path = match?.stage === 'finished' ? '/results' : match || resume ? '/match' : emptyPath
  const activeMatch = path === '/match'
  const showRules = () => setPanel('rules')
  const showPrivacy = () => setPanel('privacy')
  const showExit = () => setPanel('exit')
  const dismiss = () => setPanel(null)
  const privateTurn = match && (match.stage === 'bid-p1' || match.stage === 'bid-p2')
    ? `${match.matchId}:${match.deckIndex}:${match.stage}` : null
  const masked = privateTurn !== null && veiledTurn === privateTurn

  useEffect(() => {
    if (!privateTurn) return

    function veil() {
      setVeiledTurn(privateTurn)
      setPanel(null)
    }
    function onVisibilityChange() {
      if (document.hidden) veil()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', veil)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', veil)
    }
  }, [privateTurn])

  useLayoutEffect(() => {
    if (window.location.pathname !== path) window.history.replaceState(null, '', path)
    document.documentElement.scrollTop = 0
  }, [path])

  useEffect(() => {
    function onBack() {
      if (window.location.pathname === path) return
      if (activeMatch) {
        window.history.pushState(null, '', '/match')
        setPanel('exit')
        return
      }
      if (match) dispatch({ type: 'RESET_MATCH', matchId: match.matchId })
      setPanel(null)
      setStartError(null)
      const next = readEmptyPath()
      if (window.location.pathname !== next) window.history.replaceState(null, '', next)
      setEmptyPath(next)
    }
    window.addEventListener('popstate', onBack)
    return () => window.removeEventListener('popstate', onBack)
  }, [path, activeMatch, match, dispatch])

  function navigateEmpty(next: EmptyPath, push = false) {
    if (match) dispatch({ type: 'RESET_MATCH', matchId: match.matchId })
    if (resume) dispatch({ type: 'CLEAR_PRIVATE' })
    if (push && window.location.pathname !== next) window.history.pushState(null, '', next)
    setPanel(null)
    setStartError(null)
    setEmptyPath(next)
  }

  function start(categoryId: string, names: Record<PlayerId, string>) {
    try {
      dispatch({ type: 'START_MATCH', ...newMatchIdentity(), categoryId, names })
    } catch {
      setStartError('The match could not start. Try again in a supported browser.')
    }
  }

  function rematch() {
    if (!match) return
    try {
      const { seed, matchId } = newMatchIdentity()
      dispatch({ type: 'RESTART_SAME_CATEGORY', matchId: match.matchId, newMatchId: matchId, seed })
    } catch {
      setStartError('The rematch could not start. Try again in a supported browser.')
    }
  }

  const handoff = match?.stage === 'handoff' ? match : null
  const category = match && categories.find(({ id }) => id === match.categoryId)
  const panelTitle = panel === 'exit' ? 'Quit this match?' : panel === 'privacy' ? 'Privacy' : 'How to Play'

  return (
    <>
      {resume || handoff || masked ? (
        <PrivacyHandoff key={handoff ? 'handoff' : 'resume'} playerName={handoff?.players.p2.name} onExit={showExit}
          onContinue={() => {
            if (handoff) dispatch({ type: 'ACK_HANDOFF', ...getRoundRef(handoff) })
            else if (resume) dispatch({ type: 'RESUME_PRIVATE' })
            else setVeiledTurn(null)
          }} />
      ) : (
        <AppShell onShowRules={showRules} onShowPrivacy={showPrivacy} sound={sound}
          onHome={activeMatch ? showExit : () => navigateEmpty('/')} gamePage={path !== '/'}>
          {invalidSave && <p className="game-notice" role="status">The saved match could not be restored. Start a new game to continue.</p>}
          {storageFailed && <p className="game-notice" role="status">Draft progress can’t be saved in this browser. Keep this tab open to finish the match.</p>}
          {match && category ? (
            match.stage === 'finished' ? (
              <>
                <ResultsScreen showdown={getShowdown(match, category)} categoryEmoji={category.emoji} vote={match.localVote}
                  onRematch={rematch} onNewCategory={() => navigateEmpty('/setup')}
                  onVote={(vote) => dispatch({ type: 'SET_LOCAL_VOTE', matchId: match.matchId, vote })} />
                {startError && <p className="game-notice" role="alert">{startError}</p>}
              </>
            ) : <MatchScreen key={match.matchId} view={getMatchView(match)} category={category} dispatch={dispatch} onExit={showExit} />
          ) : match ? (
            <div className="game-notice" role="alert">This match’s category is unavailable. <Button onClick={showExit}>Exit match</Button></div>
          ) : path === '/setup' ? (
            <SetupScreen onBack={() => navigateEmpty('/')} onStart={start} error={startError} />
          ) : (
            <HomeScreen onStart={() => navigateEmpty('/setup', true)} onShowRules={showRules} />
          )}
        </AppShell>
      )}
      <Dialog open={panel !== null} title={panelTitle} onDismiss={dismiss}>
        {panel === 'exit' ? (
          <div className="exit-confirm">
            <p>Leaving the match clears this draft’s progress on this device.</p>
            <div className="game-actions">
              <Button onClick={dismiss}>Keep playing</Button>
              <Button variant="secondary" onClick={() => navigateEmpty('/')}>Quit Match</Button>
            </div>
          </div>
        ) : panel === 'privacy' ? (
          <div className="privacy-notice">
            <p>Player names, draft progress, bids, and the optional vote are saved in this browser. The game has no accounts or analytics.</p>
            <p>Sharing or downloading a result includes player names, picks, and spending. The game creates the export on this device.</p>
            <p>Quit an active match or clear this site’s browser data to remove a saved draft.</p>
          </div>
        ) : panel === 'rules' ? <HowToPlay /> : null}
      </Dialog>
    </>
  )
}
