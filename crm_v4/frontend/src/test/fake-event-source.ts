type Listener = (event: MessageEvent<string>) => void

export class FakeEventSource {
  static instances: FakeEventSource[] = []
  listeners = new Map<string, Listener[]>()
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  closed = false

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this)
  }

  addEventListener(name: string, listener: Listener) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener])
  }

  emit(name: string, data: unknown) {
    for (const listener of this.listeners.get(name) ?? []) {
      listener(new MessageEvent(name, { data: JSON.stringify(data) }))
    }
  }

  close() {
    this.closed = true
  }

  static latest() {
    return FakeEventSource.instances.at(-1)!
  }
}
