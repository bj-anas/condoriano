import { reactive, watch } from 'vue'
import { TurnEngine } from '../ai/turn-engine'
import { MODELS, isComplexQuestion, modelById } from '../ai/models'
import { AiError, toAiError } from '../ai/errors'
import type { CallState, ChatTurn, EngineEvents, EngineKind, ModelOption, Role, VoiceEngine } from '../ai/types'
import { MicrophoneError } from '../audio/microphone'
import { hasUserActivation, unlockAudio } from '../audio/context'
import { recognitionErrorMessage } from '../audio/speech'
import { getKnowledgeBase, loadKnowledgeBase } from '../knowledge'
import { isSetUp, settings } from '../stores/settings'
import { notify } from '../stores/notifications'
import { openModelPicker, ui } from '../stores/ui'
import { WakeWordListener } from '../wake/listener'
import { prepareImage } from '../screenshots/image'
import { FolderWatcher, folderPermission, savedFolder } from '../screenshots/folder'
import { describeWait, msUntilPacificMidnight } from './time'

export interface TranscriptLine {
  id: number
  role: Role
  text: string
  final: boolean
}

export type WakeStatus = 'off' | 'listening' | 'needs-click' | 'blocked' | 'unsupported'

/** Everything the UI shows about the call. Lives in memory only; nothing here is saved. */
export const call = reactive({
  state: 'idle' as CallState,
  model: null as ModelOption | null,
  transcript: [] as TranscriptLine[],
  screenshot: null as { url: string; at: number } | null,
  wake: 'off' as WakeStatus,
  /** model id → time (ms) its free limit should be back */
  exhausted: {} as Record<string, number>,
})

const BYE = /\b(bye|goodbye|good bye|see you|see ya|that'?s all|i'?m done)\b/i
const SPEECH_RMS = 0.02
const BYE_GRACE_MS = 12_000
const DEFAULT_QUOTA_WAIT_S = 300

let engine: VoiceEngine | null = null
let engineStarted = false
let lastActivity = 0
let endAfterReply = false
let saidGoodbye = false
let byeTimer: ReturnType<typeof setTimeout> | undefined
let pendingImage: string | null = null
let watcher: FolderWatcher | null = null
let lineId = 1
/** Bumped by every start/end, so a call ended while the engine was loading never starts. */
let callToken = 0

// The Gemini SDK is large: load the live engine on demand (and warm it up after the first paint).
const loadLiveEngine = () => import('../ai/gemini-live').then((m) => m.GeminiLiveEngine)
setTimeout(() => {
  void loadLiveEngine().catch(() => {})
  void loadKnowledgeBase().catch(() => {})
}, 1500)

// ── Models ────────────────────────────────────────────────────────────────────

export function isExhausted(id: string): boolean {
  return (call.exhausted[id] ?? 0) > Date.now()
}

/** Why a model can't be used right now, or null when it can. */
export function unavailableReason(model: ModelOption): string | null {
  if (model.provider === 'groq' && !settings.groqKey) return 'Needs a Groq key'
  if (isExhausted(model.id)) return `Limit reached · back ${describeWait(call.exhausted[model.id])}`
  return null
}

const usable = (m: ModelOption) => unavailableReason(m) === null

/** What Auto starts with: real-time voice first, then Flash, Flash-Lite, Groq. */
export function autoModel(): ModelOption | null {
  return MODELS.find(usable) ?? null
}

/** The model a new call starts with. */
export function firstModel(): ModelOption | null {
  if (settings.model === 'auto') return autoModel()
  const chosen = modelById(settings.model)
  return chosen && usable(chosen) ? chosen : null
}

/** Auto routing for turn-based calls: screenshots and complex questions → Flash, the rest → Flash-Lite. */
function pickTurnModel(question: { text: string; hasImage: boolean }): ModelOption | null {
  let pick: ModelOption | null
  if (settings.model !== 'auto') {
    const chosen = modelById(settings.model)
    pick = chosen && chosen.engine === 'turn' && usable(chosen) ? chosen : null
  } else {
    const order = isComplexQuestion(question.text, question.hasImage)
      ? ['flash', 'lite', 'fallback']
      : ['lite', 'flash', 'fallback']
    pick =
      MODELS.filter((m) => m.engine === 'turn' && usable(m) && (!question.hasImage || m.supportsImages)).sort(
        (a, b) => order.indexOf(a.tier) - order.indexOf(b.tier),
      )[0] ?? null
    if (!pick) noModelLeft()
  }
  if (pick) call.model = pick
  return pick
}

function canSeeScreenshots(model: ModelOption): boolean {
  if (settings.model === 'auto' && model.engine === 'turn') {
    return MODELS.some((m) => m.engine === 'turn' && m.supportsImages && usable(m))
  }
  return model.supportsImages
}

/** Marks the model as used up, warns, and returns the Auto fallback (null in manual mode). */
function handleQuota(model: ModelOption, error: AiError): ModelOption | null {
  const until = error.daily
    ? Date.now() + msUntilPacificMidnight()
    : Date.now() + (error.retryAfterSec ?? DEFAULT_QUOTA_WAIT_S) * 1000
  call.exhausted[model.id] = until
  const back = error.daily ? 'Its daily limit resets at midnight Pacific time.' : `It should be back ${describeWait(until)}.`
  const next = settings.model === 'auto' ? autoModel() : null
  const changeModel = { label: 'Change model', run: () => openModelPicker() }

  if (next) {
    notify({
      kind: 'warning',
      title: `${model.label} hit its free limit`,
      message: `Switched to ${next.label}. ${back}`,
      actions: [changeModel],
    })
  } else {
    notify({
      kind: 'warning',
      title: `${model.label} hit its free limit`,
      message: `${back} Pick another model to keep talking.`,
      actions: [changeModel],
    })
    openModelPicker(`${model.label} hit its free limit. Pick another model to keep talking.`)
  }
  return next
}

function noModelLeft(): void {
  notify({
    kind: 'warning',
    title: 'All free limits are used up',
    message: 'Add a Groq key or wait for the limits to reset.',
    actions: [{ label: 'Change model', run: () => openModelPicker() }],
  })
  openModelPicker('Every available model hit its free limit.')
}

// ── Prompt ────────────────────────────────────────────────────────────────────

function systemPrompt(): string {
  const kb = getKnowledgeBase()
  return kb.skill
    .replaceAll('{user_name}', settings.userName.trim())
    .replaceAll('{kb_version}', kb.version)
    .replaceAll('{language}', settings.language)
}

function greeting(kind: EngineKind): string {
  const name = settings.userName.trim()
  const line = `Hi ${name}, do you need some help with Black Desert?`
  // The live model is asked to say it; the turn engine speaks it directly (no API call, no quota).
  return kind === 'live' ? `[${name} just called you. Greet them with exactly this sentence and nothing else: "${line}"]` : line
}

// ── Engine wiring ─────────────────────────────────────────────────────────────

async function createEngine(model: ModelOption, history: ChatTurn[]): Promise<VoiceEngine> {
  let self: VoiceEngine | null = null
  const current = () => self !== null && engine === self

  const events: EngineEvents = {
    onState(state) {
      if (!current()) return
      const previous = call.state
      call.state = state
      if (state !== 'listening') lastActivity = Date.now()
      if (endAfterReply && state === 'speaking') saidGoodbye = true
      if (endAfterReply && saidGoodbye && state === 'listening' && previous === 'speaking') endCall()
    },
    onTranscript(role, text, final) {
      if (!current()) return
      addTranscript(role, text, final)
      if (role === 'user') {
        lastActivity = Date.now()
        if (BYE.test(text)) scheduleBye()
      }
    },
    onMicLevel(rms) {
      if (!current()) return
      if (rms > SPEECH_RMS) lastActivity = Date.now()
      checkSilence()
    },
    onError(error, failedModel) {
      if (current()) void handleEngineError(error, failedModel)
    },
    onEnded(reason) {
      if (!current()) return
      endCall()
      notify({ kind: 'info', title: 'Call ended', message: reason })
    },
  }

  const ctx = { systemPrompt: systemPrompt(), greeting: greeting(model.engine), history, events }
  self =
    model.engine === 'live'
      ? new (await loadLiveEngine())(settings.geminiKey, model, settings.liveVoice, ctx)
      : new TurnEngine(
          model,
          {
            keys: { gemini: settings.geminiKey, groq: settings.groqKey },
            browserVoice: settings.browserVoice,
            pickModel: pickTurnModel,
            onQuota: (m, e) => void handleQuota(m, e),
          },
          ctx,
        )
  return self
}

async function runEngine(model: ModelOption, history: ChatTurn[]): Promise<void> {
  const token = callToken
  call.model = model
  call.state = 'connecting'
  let next: VoiceEngine
  try {
    await loadKnowledgeBase()
    next = await createEngine(model, history)
  } catch {
    notify({ kind: 'error', title: "Couldn't load the voice engine", message: 'Check your connection and try again.' })
    endCall()
    return
  }
  if (token !== callToken) return
  engine = next
  engineStarted = false
  lastActivity = Date.now()
  try {
    await next.start()
    if (engine !== next) return
    engineStarted = true
    if (pendingImage) {
      next.sendImage(pendingImage)
      pendingImage = null
    }
  } catch (err) {
    if (engine !== next) return
    next.end()
    await handleEngineError(err, model)
  }
}

async function switchTo(model: ModelOption): Promise<void> {
  const history = call.transcript.filter((l) => l.final && l.text).map((l) => ({ role: l.role, text: l.text }))
  engine?.end()
  engine = null
  await runEngine(model, history)
}

async function handleEngineError(err: unknown, model: ModelOption): Promise<void> {
  if (err instanceof MicrophoneError) {
    notify({ kind: 'error', title: 'Microphone problem', message: err.message })
    endCall()
    return
  }
  const error = toAiError(err)
  const changeModel = { label: 'Change model', run: () => openModelPicker() }

  if (error.kind === 'quota') {
    const next = handleQuota(model, error)
    if (next) await switchTo(next)
    else endCall()
    return
  }
  if (error.kind === 'auth') {
    notify({
      kind: 'error',
      title: 'Your API key was rejected',
      message: error.message,
      actions: [{ label: 'Open settings', run: () => (ui.settingsOpen = true) }],
    })
    endCall()
    return
  }
  if (error.kind === 'model') {
    // Not available for this key or region: skip it for the rest of this visit.
    call.exhausted[model.id] = Date.now() + 24 * 3600_000
    const next = settings.model === 'auto' ? autoModel() : null
    notify({
      kind: 'warning',
      title: `${model.label} isn't available right now`,
      message: next ? `Switched to ${next.label}. (${error.message})` : error.message,
      actions: [changeModel],
    })
    if (next) await switchTo(next)
    else endCall()
    return
  }
  // A turn-based call survives a failed answer; a live call has lost its connection.
  if (engine?.kind === 'turn' && engineStarted) {
    notify({ kind: 'error', title: "Condoriano couldn't answer", message: error.message })
    return
  }
  notify({ kind: 'error', title: 'The call dropped', message: error.message })
  endCall()
}

function addTranscript(role: Role, text: string, final: boolean): void {
  const last = call.transcript.at(-1)
  if (last && last.role === role && !last.final) {
    last.text = text
    last.final = final
  } else {
    call.transcript.push({ id: lineId++, role, text, final })
  }
  if (call.transcript.length > 80) call.transcript.splice(0, call.transcript.length - 80)
}

/** After "bye": let Condoriano say goodbye, then hang up (or hang up anyway after a grace period). */
function scheduleBye(): void {
  if (endAfterReply) return
  endAfterReply = true
  saidGoodbye = call.state === 'speaking'
  byeTimer = setTimeout(() => endCall(), BYE_GRACE_MS)
}

function checkSilence(): void {
  const limit = settings.silenceTimeoutSec * 1000
  if (!limit || call.state !== 'listening' || Date.now() - lastActivity < limit) return
  endCall()
  notify({ kind: 'info', title: 'Call ended', message: `No one spoke for ${settings.silenceTimeoutSec} seconds.` })
}

// ── Public actions ────────────────────────────────────────────────────────────

export async function startCall(source: 'button' | 'wake' = 'button'): Promise<void> {
  if (engine || call.state !== 'idle' || !isSetUp.value) return
  if (source === 'button') unlockAudio()
  stopWake()
  const model = firstModel()
  if (!model) {
    pendingImage = null
    const chosen = modelById(settings.model)
    if (chosen && chosen.provider === 'groq' && !settings.groqKey) {
      notify({ kind: 'warning', title: 'Groq key missing', message: `${chosen.label} needs a Groq key in Settings.` })
      ui.settingsOpen = true
    } else {
      noModelLeft()
    }
    armWake()
    return
  }
  call.transcript = []
  endAfterReply = saidGoodbye = false
  callToken++
  void startFolderWatch(source === 'button')
  await runEngine(model, [])
}

export function endCall(): void {
  callToken++
  clearTimeout(byeTimer)
  endAfterReply = saidGoodbye = false
  pendingImage = null
  const ending = engine
  engine = null
  ending?.end()
  call.state = 'idle'
  watcher?.stop()
  watcher = null
  // Give the browser a moment to release the mic before the wake word takes it again.
  setTimeout(armWake, 600)
}

export function toggleCall(): void {
  if (engine || call.state !== 'idle') endCall()
  else void startCall('button')
}

/** Pause button: stop the current answer, keep the call open. */
export function pauseSpeaking(): void {
  engine?.stopSpeaking()
  lastActivity = Date.now()
}

/** Switches model from the picker. During a call, the conversation moves to the new model. */
export async function chooseModel(id: string): Promise<void> {
  settings.model = id
  if (!engine) return
  const model = firstModel()
  if (!model) noModelLeft()
  else if (model.id !== engine.currentModel.id) await switchTo(model)
}

export async function sendScreenshot(blob: Blob): Promise<void> {
  if (!isSetUp.value) return
  const model = engine?.currentModel ?? firstModel()
  if (!model) {
    noModelLeft()
    return
  }
  if (!canSeeScreenshots(model)) {
    notify({
      kind: 'warning',
      title: `${model.label} can't see screenshots`,
      message: 'Switch to a model that supports screenshots, like Gemini 3.8 Live or Flash.',
      actions: [{ label: 'Change model', run: () => openModelPicker('Pick a model that can see screenshots.') }],
    })
    return
  }

  let image
  try {
    image = await prepareImage(blob)
  } catch {
    notify({ kind: 'error', title: "Couldn't read that image", message: 'Try a PNG or JPG screenshot.' })
    return
  }
  if (call.screenshot) URL.revokeObjectURL(call.screenshot.url)
  call.screenshot = { url: image.previewUrl, at: Date.now() }
  lastActivity = Date.now()

  if (engine && engineStarted) engine.sendImage(image.base64)
  else {
    pendingImage = image.base64
    if (call.state === 'idle') await startCall('button')
  }
}

export function levels(): { input: number; output: number } {
  return engine ? { input: engine.inputLevel(), output: engine.outputLevel() } : { input: 0, output: 0 }
}

// ── Wake word ─────────────────────────────────────────────────────────────────

const wakeListener = new WakeWordListener(
  () => void startCall('wake'),
  (error) => {
    call.wake = 'blocked'
    notify({
      kind: 'warning',
      title: 'Wake word stopped',
      message: `${recognitionErrorMessage(error)} Use the mic button, or click the wake word status to retry.`,
    })
  },
)

function stopWake(): void {
  wakeListener.stop()
  if (call.wake === 'listening') call.wake = 'off'
}

export function armWake(): void {
  if (engine || call.state !== 'idle' || !isSetUp.value || !settings.wakeWordEnabled) {
    stopWake()
    if (!settings.wakeWordEnabled) call.wake = 'off'
    return
  }
  if (!WakeWordListener.supported()) {
    call.wake = 'unsupported'
    return
  }
  if (call.wake === 'blocked') return
  if (!hasUserActivation()) {
    call.wake = 'needs-click'
    return
  }
  wakeListener.start(settings.wakeSensitivity)
  call.wake = 'listening'
}

export function retryWake(): void {
  unlockAudio()
  wakeListener.stop()
  call.wake = 'off'
  armWake()
}

watch(
  () => [settings.wakeWordEnabled, settings.wakeSensitivity, isSetUp.value] as const,
  () => {
    wakeListener.stop()
    if (call.wake === 'listening') call.wake = 'off'
    armWake()
  },
)

// The first click on the page unlocks audio, so later wake-word calls can play sound.
window.addEventListener(
  'pointerdown',
  () => {
    unlockAudio()
    if (call.wake === 'needs-click') armWake()
  },
  { capture: true },
)

// ── Screenshot folder ─────────────────────────────────────────────────────────

async function startFolderWatch(fromClick: boolean): Promise<void> {
  if (!settings.watchScreenshotFolder) return
  const handle = await savedFolder()
  if (!handle) return
  const begin = async () => {
    if (!engine) return
    watcher?.stop()
    watcher = new FolderWatcher(handle, (file) => void sendScreenshot(file))
    await watcher.start()
  }
  const state = await folderPermission(handle, fromClick).catch(() => 'denied' as const)
  if (state === 'granted') {
    await begin()
    return
  }
  notify({
    kind: 'info',
    title: 'Allow the screenshot folder',
    message: 'The browser needs a click before Print Screen shots can reach Condoriano.',
    actions: [
      {
        label: 'Allow',
        run: () => void folderPermission(handle, true).then((s) => (s === 'granted' ? begin() : undefined)),
      },
    ],
  })
}
