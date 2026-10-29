// Explicit development fixture: absent from production builds. Use ?radio-test.
import type { Telemetry } from '../../../shared/host'
import { go, useCabin, useLive } from '../../state/store'

export function radioPreviewControls() {
  const panel = document.createElement('div')
  panel.style.cssText =
    'position:fixed;z-index:99999;bottom:4px;right:4px;display:flex;gap:4px;background:#17382c;padding:6px;border-radius:8px;color:white'
  for (const [name, x, z] of [
    ['Poland', 22863.4, -9112.2],
    ['Germany', 10343, -9903.56],
    ['No game', 0, 0],
    ['Dashboard', 22863.4, -9112.2],
    ['Dashboard XL', 22863.4, -9112.2],
    ['Dashboard small', 22863.4, -9112.2],
    ['Dashboard no route', 22863.4, -9112.2],
  ] as const) {
    const button = document.createElement('button')
    button.textContent = `Test: ${name}`
    button.onclick = () => {
      const base: Telemetry = {
        x,
        y: 10,
        z,
        heading: 0,
        pitch: 0,
        roll: 0,
        speed: name.startsWith('Dashboard') ? 28.33 : 0,
        engineRpm: 700,
        gear: 0,
        displayedGear: 0,
        cruiseControlSpeed: 0,
        fuel: 200,
        fuelRange: 400,
        navigationDistance: name.startsWith('Dashboard') && !name.endsWith('no route') ? 321456 : 0,
        navigationTime: name.startsWith('Dashboard') ? 19800 : 0,
        navigationSpeedLimit: name.startsWith('Dashboard') ? 22.22 : 0,
        gameTime: 720,
        multiplayerTimeOffset: 0,
        localScale: 19,
        dashboardBacklight: 1,
        electricEnabled: true,
        engineEnabled: true,
        parkingBrake: true,
        lowBeam: false,
        highBeam: false,
        leftBlinker: false,
        rightBlinker: false,
        paused: false,
      }
      useLive.setState({ telemetry: x === 0 ? null : base })
      if (name.startsWith('Dashboard')) {
        useCabin.getState().setTextSize(name.endsWith('XL') ? 8 : name.endsWith('small') ? 0 : 4)
        go({ type: 'showDashboard' })
      }
    }
    panel.append(button)
  }
  document.body.append(panel)
}
