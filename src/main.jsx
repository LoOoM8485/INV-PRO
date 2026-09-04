import { StrictMode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import './index.css'
import './fullscreen.css'
import App from './App.jsx'

function FullscreenControl() {
  const [target, setTarget] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(
    Boolean(document.fullscreenElement || document.webkitFullscreenElement),
  )

  useEffect(() => {
    const findTarget = () => {
      const nextTarget = document.querySelector('#root header > div:last-child')
      if (nextTarget) setTarget(nextTarget)
    }

    findTarget()

    const observer = new MutationObserver(findTarget)
    observer.observe(document.getElementById('root'), {
      childList: true,
      subtree: true,
    })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const updateFullscreen = () =>
      setIsFullscreen(
        Boolean(document.fullscreenElement || document.webkitFullscreenElement),
      )

    document.addEventListener('fullscreenchange', updateFullscreen)
    document.addEventListener('webkitfullscreenchange', updateFullscreen)

    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreen)
      document.removeEventListener('webkitfullscreenchange', updateFullscreen)
    }
  }, [])

  const toggleFullscreen = async () => {
    const fullscreenElement =
      document.fullscreenElement || document.webkitFullscreenElement

    try {
      if (!fullscreenElement) {
        const request =
          document.documentElement.requestFullscreen ||
          document.documentElement.webkitRequestFullscreen

        if (request) await request.call(document.documentElement)
      } else {
        const exit = document.exitFullscreen || document.webkitExitFullscreen
        if (exit) await exit.call(document)
      }
    } catch (error) {
      console.warn('Fullscreen unavailable.', error)
    }
  }

  if (!target) return null

  return createPortal(
    <button
      type="button"
      className="inv-fullscreen-button"
      onClick={toggleFullscreen}
      aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
      title={isFullscreen ? 'Exit full screen' : 'Full screen'}
    >
      {isFullscreen ? 'EXIT FULL' : 'FULL SCREEN'}
    </button>,
    target,
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <FullscreenControl />
  </StrictMode>,
)
