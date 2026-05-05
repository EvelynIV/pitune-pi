import { useMemo, useState } from 'react'
import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import './App.css'

type PageId = 'gain' | 'target' | 'monitor' | 'serial'
type Direction = 'Forward' | 'Reverse'
type Mode = 'Manual' | 'Auto'

type PidSettings = {
  kp: number
  ki: number
  kd: number
  setpoint: number
  outputMin: number
  outputMax: number
  sampleTime: number
  mode: Mode
  direction: Direction
}

type TelemetryPoint = {
  time: string
  pv: number
  output: number
}

const initialSettings: PidSettings = {
  kp: 1.6,
  ki: 0.32,
  kd: 0.08,
  setpoint: 65,
  outputMin: 0,
  outputMax: 100,
  sampleTime: 100,
  mode: 'Auto',
  direction: 'Forward',
}

const tabs: Array<{ id: PageId; label: string; icon: string }> = [
  { id: 'gain', label: 'PID', icon: 'P' },
  { id: 'target', label: '目标', icon: 'T' },
  { id: 'monitor', label: '监控', icon: 'M' },
  { id: 'serial', label: '串口', icon: 'S' },
]

const telemetry: TelemetryPoint[] = [
  { time: '00:00', pv: 48, output: 72 },
  { time: '00:05', pv: 54, output: 76 },
  { time: '00:10', pv: 59, output: 70 },
  { time: '00:15', pv: 62, output: 58 },
  { time: '00:20', pv: 64, output: 48 },
  { time: '00:25', pv: 66, output: 42 },
  { time: '00:30', pv: 65, output: 44 },
  { time: '00:35', pv: 65.4, output: 43 },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function formatCommand(settings: PidSettings) {
  return [
    `KP=${settings.kp.toFixed(2)}`,
    `KI=${settings.ki.toFixed(2)}`,
    `KD=${settings.kd.toFixed(2)}`,
    `SP=${settings.setpoint.toFixed(1)}`,
    `OUT=${settings.outputMin.toFixed(0)}:${settings.outputMax.toFixed(0)}`,
    `TS=${settings.sampleTime}`,
    `MODE=${settings.mode.toUpperCase()}`,
    `DIR=${settings.direction.toUpperCase()}`,
  ].join(';')
}

function buildPath(values: number[], width: number, height: number) {
  const max = 100
  const min = 0
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width
      const y = height - ((value - min) / (max - min)) * height
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

function App() {
  const [activePage, setActivePage] = useState<PageId>('gain')
  const [settings, setSettings] = useState<PidSettings>(initialSettings)
  const [connected, setConnected] = useState(false)
  const [log, setLog] = useState<string[]>([
    '系统就绪，等待串口连接',
    `预览命令 ${formatCommand(initialSettings)}`,
  ])

  const command = useMemo(() => formatCommand(settings), [settings])
  const latest = telemetry[telemetry.length - 1]
  const error = settings.setpoint - latest.pv
  const outputSpan = settings.outputMax - settings.outputMin

  const updateNumber = (key: keyof PidSettings, value: number) => {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const pushLog = (line: string) => {
    setLog((current) => [line, ...current].slice(0, 8))
  }

  const sendSettings = () => {
    pushLog(`TX ${command}`)
  }

  return (
    <main className="kiosk-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">PID Kiosk</p>
          <h1>控制器调参台</h1>
        </div>
        <div className="status-strip" aria-label="运行状态">
          <span className={connected ? 'status-dot online' : 'status-dot'} />
          <span>{connected ? '串口已连接' : '离线预览'}</span>
          <strong>{settings.mode}</strong>
        </div>
      </header>

      <nav className="page-tabs" aria-label="分页导航">
        {tabs.map((tab) => (
          <button
            className={activePage === tab.id ? 'tab active' : 'tab'}
            key={tab.id}
            onClick={() => setActivePage(tab.id)}
            type="button"
          >
            <span className="tab-icon" aria-hidden="true">
              {tab.icon}
            </span>
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="workspace">
        {activePage === 'gain' && (
          <GainPage
            sendSettings={sendSettings}
            setSettings={setSettings}
            settings={settings}
            updateNumber={updateNumber}
          />
        )}
        {activePage === 'target' && (
          <TargetPage
            command={command}
            outputSpan={outputSpan}
            sendSettings={sendSettings}
            settings={settings}
            updateNumber={updateNumber}
          />
        )}
        {activePage === 'monitor' && (
          <MonitorPage
            error={error}
            latest={latest}
            settings={settings}
          />
        )}
        {activePage === 'serial' && (
          <SerialPage
            command={command}
            connected={connected}
            log={log}
            pushLog={pushLog}
            sendSettings={sendSettings}
            setConnected={setConnected}
          />
        )}

      </section>
    </main>
  )
}

function GainPage({
  sendSettings,
  setSettings,
  settings,
  updateNumber,
}: {
  sendSettings: () => void
  setSettings: Dispatch<SetStateAction<PidSettings>>
  settings: PidSettings
  updateNumber: (key: keyof PidSettings, value: number) => void
}) {
  return (
    <div className="page-stack gain-page">
      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Loop Gain</p>
            <h2>核心参数</h2>
          </div>
          <button className="primary-action" onClick={sendSettings} type="button">
            下发
          </button>
        </div>

        <PidSlider
          label="比例 Kp"
          max={10}
          min={0}
          onChange={(value) => updateNumber('kp', value)}
          step={0.01}
          value={settings.kp}
        />
        <PidSlider
          label="积分 Ki"
          max={5}
          min={0}
          onChange={(value) => updateNumber('ki', value)}
          step={0.01}
          value={settings.ki}
        />
        <PidSlider
          label="微分 Kd"
          max={3}
          min={0}
          onChange={(value) => updateNumber('kd', value)}
          step={0.01}
          value={settings.kd}
        />
      </section>

      <section className="panel compact-panel">
        <div className="toggle-row">
          <span>模式</span>
          <Segmented
            active={settings.mode}
            options={['Auto', 'Manual']}
            onChange={(mode) =>
              setSettings((current) => ({ ...current, mode: mode as Mode }))
            }
          />
        </div>
        <div className="toggle-row">
          <span>方向</span>
          <Segmented
            active={settings.direction}
            options={['Forward', 'Reverse']}
            onChange={(direction) =>
              setSettings((current) => ({
                ...current,
                direction: direction as Direction,
              }))
            }
          />
        </div>
      </section>
    </div>
  )
}

function TargetPage({
  command,
  outputSpan,
  sendSettings,
  settings,
  updateNumber,
}: {
  command: string
  outputSpan: number
  sendSettings: () => void
  settings: PidSettings
  updateNumber: (key: keyof PidSettings, value: number) => void
}) {
  return (
    <div className="page-stack target-page">
      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Target</p>
            <h2>目标与输出</h2>
          </div>
          <button className="primary-action" onClick={sendSettings} type="button">
            下发
          </button>
        </div>

        <PidSlider
          label="设定值"
          max={100}
          min={0}
          onChange={(value) => updateNumber('setpoint', value)}
          step={0.1}
          value={settings.setpoint}
        />
        <PidSlider
          label="输出下限"
          max={settings.outputMax - 1}
          min={0}
          onChange={(value) => updateNumber('outputMin', value)}
          step={1}
          value={settings.outputMin}
        />
        <PidSlider
          label="输出上限"
          max={100}
          min={settings.outputMin + 1}
          onChange={(value) => updateNumber('outputMax', value)}
          step={1}
          value={settings.outputMax}
        />
        <PidSlider
          label="周期 ms"
          max={1000}
          min={10}
          onChange={(value) => updateNumber('sampleTime', Math.round(value))}
          step={10}
          value={settings.sampleTime}
        />
      </section>

      <section className="panel command-panel">
        <div className="metric-pair">
          <Metric label="输出跨度" value={outputSpan.toFixed(0)} />
          <Metric label="周期" value={`${settings.sampleTime}`} />
        </div>
        <code>{command}</code>
      </section>
    </div>
  )
}

function MonitorPage({
  error,
  latest,
  settings,
}: {
  error: number
  latest: TelemetryPoint
  settings: PidSettings
}) {
  const pvPath = buildPath(
    telemetry.map((point) => point.pv),
    620,
    220,
  )
  const outputPath = buildPath(
    telemetry.map((point) => point.output),
    620,
    220,
  )
  const setpointY = 220 - (settings.setpoint / 100) * 220

  return (
    <div className="page-stack monitor-page">
      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Realtime</p>
            <h2>过程曲线</h2>
          </div>
          <div className="legend">
            <span className="legend-pv">PV</span>
            <span className="legend-output">OUT</span>
            <span className="legend-sp">SP</span>
          </div>
        </div>
        <svg className="trend-chart" viewBox="0 0 620 220" role="img" aria-label="PID趋势曲线">
          <line className="setpoint-line" x1="0" x2="620" y1={setpointY} y2={setpointY} />
          <path className="output-line" d={outputPath} />
          <path className="pv-line" d={pvPath} />
        </svg>
      </section>

      <section className="metrics-grid">
        <Metric label="过程值 PV" value={latest.pv.toFixed(1)} />
        <Metric label="设定值 SP" value={settings.setpoint.toFixed(1)} />
        <Metric label="控制输出" value={`${latest.output.toFixed(0)}%`} />
        <Metric label="误差" value={error.toFixed(1)} />
      </section>

      <section className="panel table-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Samples</p>
            <h2>采样记录</h2>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>PV</th>
              <th>输出</th>
            </tr>
          </thead>
          <tbody>
            {telemetry.slice(-4).map((point) => (
              <tr key={point.time}>
                <td>{point.time}</td>
                <td>{point.pv.toFixed(1)}</td>
                <td>{point.output.toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function SerialPage({
  command,
  connected,
  log,
  pushLog,
  sendSettings,
  setConnected,
}: {
  command: string
  connected: boolean
  log: string[]
  pushLog: (line: string) => void
  sendSettings: () => void
  setConnected: Dispatch<SetStateAction<boolean>>
}) {
  const toggleConnection = () => {
    setConnected((current) => {
      pushLog(current ? '串口已断开' : '串口已连接 /dev/ttyUSB0 @ 115200')
      return !current
    })
  }

  return (
    <div className="page-stack serial-page">
      <section className="panel connection-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Connection</p>
            <h2>串口通讯</h2>
          </div>
          <button className="primary-action" onClick={toggleConnection} type="button">
            {connected ? '断开' : '连接'}
          </button>
        </div>
        <div className="serial-fields">
          <label>
            端口
            <input defaultValue="/dev/ttyUSB0" />
          </label>
          <label>
            波特率
            <input defaultValue="115200" inputMode="numeric" />
          </label>
          <label>
            超时
            <input defaultValue="0.1s" />
          </label>
        </div>
        <button className="secondary-action" onClick={sendSettings} type="button">
          发送当前参数
        </button>
      </section>

      <section className="panel command-panel">
        <p className="eyebrow">Pending TX</p>
        <code>{command}</code>
      </section>

      <section className="panel log-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Message Log</p>
            <h2>收发日志</h2>
          </div>
          <button
            className="quiet-action"
            onClick={() => pushLog('RX ACK;PV=65.4;OUT=43')}
            type="button"
          >
            模拟接收
          </button>
        </div>
        <ol>
          {log.slice(0, 4).map((line, index) => (
            <li key={`${line}-${index}`}>{line}</li>
          ))}
        </ol>
      </section>
    </div>
  )
}


function PidSlider({
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  step: number
  value: number
}) {
  const normalized = clamp(((value - min) / (max - min)) * 100, 0, 100)

  return (
    <label className="slider-control">
      <span className="slider-label">{label}</span>
      <input
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        style={{ '--value': `${normalized}%` } as CSSProperties}
        type="range"
        value={value}
      />
      <span className="slider-value">{Number.isInteger(step) ? value.toFixed(0) : value.toFixed(2)}</span>
    </label>
  )
}

function Segmented({
  active,
  onChange,
  options,
}: {
  active: string
  onChange: (value: string) => void
  options: string[]
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          className={active === option ? 'active' : ''}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {option}
        </button>
      ))}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default App
