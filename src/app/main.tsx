import { render } from 'preact'
import { useCallback, useEffect, useState } from 'preact/hooks'
import '@fontsource-variable/nunito'
import './styles.css'
import { installZoomGuards } from './zoom-guard'
import { IDENTITY_CLEARED_EVENT, type Identity, loadIdentity } from './identity'
import { NameGate } from './components/NameGate'
import { HapticsLab } from './components/HapticsLab'
import { Home } from './screens/Home'
import { Lounge } from './screens/Lounge'
import { Group } from './screens/Group'

function App() {
  const [path, setPath] = useState(location.pathname)
  const [identity, setIdentity] = useState<Identity | null>(loadIdentity())

  useEffect(() => {
    const onPop = () => setPath(location.pathname)
    const onIdentityCleared = () => setIdentity(null)
    window.addEventListener('popstate', onPop)
    window.addEventListener(IDENTITY_CLEARED_EVENT, onIdentityCleared)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener(IDENTITY_CLEARED_EVENT, onIdentityCleared)
    }
  }, [])

  const navigate = useCallback((to: string) => {
    history.pushState(null, '', to)
    setPath(to)
    window.scrollTo(0, 0)
  }, [])

  if (path === '/haptics') return <HapticsLab />

  if (!identity) {
    return <NameGate onReady={setIdentity} />
  }

  const loungeMatch = path.match(/^\/l\/([A-Za-z0-9-]+)/)
  if (loungeMatch) {
    return (
      <Lounge
        // key forces a clean remount when hopping lounge → rematch lounge
        key={loungeMatch[1]}
        code={loungeMatch[1].toUpperCase()}
        identity={identity}
        navigate={navigate}
      />
    )
  }
  const groupMatch = path.match(/^\/g\/([A-Za-z0-9-]+)/)
  if (groupMatch) {
    return (
      <Group
        key={groupMatch[1]}
        code={groupMatch[1].toUpperCase()}
        identity={identity}
        navigate={navigate}
      />
    )
  }
  return <Home navigate={navigate} onIdentityLost={() => setIdentity(null)} />
}

installZoomGuards()
render(<App />, document.getElementById('app')!)
