
socket_url: "ws://14.225.204.65:6868/socket",
        socket_url_dev: "ws://14.225.204.65:6868/socket",
        socket_url_staging: "ws://14.225.204.65:6868/socket"

connect = async (): Promise<void> => {
    try {
      console.log("[WS] Connecting...")

      // Ngắt kết nối cũ nếu còn
      if (this.socket) {
        this._cleanupSocket()
      }

      this.isIntentionalClose = false
      this.isAuthenticated = false

      // Lấy và cache token
      this.cachedToken = await this.authenService.getAuthen()

      const ws = this._createWebSocket()
      this.socket = ws

      return new Promise<void>((resolve, reject) => {
        if (!this.socket) return reject(new Error("No socket"))

        // Timeout kết nối 10s
        const connectionTimeout = setTimeout(() => {
          reject(new Error("[WS] Connection timeout"))
          this._cleanupSocket()
        }, 10000)

        this.socket.onopen = async () => {
          clearTimeout(connectionTimeout)
          console.log("[WS] Connected ✓")
          this.reconnectAttempts = 0
          await this._sendAuth()
          resolve()
        }

        this.socket.onmessage = (event) => {
          this._handleMessage(event)
        }

        this.socket.onerror = (error) => {
          clearTimeout(connectionTimeout)
          console.error("[WS] Error:", error)
          reject(error)
        }

        this.socket.onclose = (event) => {
          console.log("[WS] Closed:", {
            code: event.code,
            reason: event.reason || "No reason",
            wasClean: event.wasClean,
            intentional: this.isIntentionalClose,
          })

          this._stopHeartbeat()
          this.isAuthenticated = false
          this.authData = null

          if (!this.isIntentionalClose && this.reconnectAttempts < this.maxReconnectAttempts) {
            this._scheduleReconnect()
          } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error("[WS] Max reconnect attempts reached")
          }
        }
      })
    } catch (err) {
      console.error("[WS] Connect error:", err)
      throw err
    }
  }

  private _createWebSocket = (): WebSocket => {
    if (this.cachedToken) {
      return new (WebSocket as any)(this.BASE_URL, [], {
        headers: {
          Authorization: `Bearer ${this.cachedToken}`,
        },
      })
    }
    return new WebSocket(this.BASE_URL)
  }


  import Event from "constans/Event"
import AuthenticationService from "interfaces/AuthenticationService"
import Coordinate from "interfaces/Coordinate"
import { replace } from "navigation/NavigationServices"
import EventEmitter from "react-native-eventemitter"

// ============= CONSTANTS =============

const DESTINATIONS = {
  AUTH: "doauth.socket",
  PING: "doping.socket",
}

const EVENT_TYPES = {
  PING: "doping",
  ACCEPT_RIDE: "accept_ride",
  CHAT: "chat",
  FOUND_GO: "BOOKING.offer",
  CANCEL_GO: "BOOKING.cancelled",
  GRAB_PASSERSBY: "grab_passersby",
  UPDATE_DISTANCE: "update_distance",
}

const SYSTEM_DESTINATIONS = {
  PONG: "EVENTS.doping",
}

const RESPONSE_DESTINATIONS = {
  AUTH_SUCCESS: "EVENTS.doauth",
  ERROR: "EVENTS.error",
}

const HEARTBEAT_INTERVAL_MS = 25000  // 25s — ping trước khi server timeout (thường 30s)
const BASE_RECONNECT_DELAY_MS = 2000 // delay tối thiểu khi reconnect
const MAX_RECONNECT_DELAY_MS = 30000 // delay tối đa khi reconnect (exponential backoff)

// ============= CLASS =============

class SocketService {
  private authenService: AuthenticationService
  private BASE_URL: string
  static instance: SocketService

  private socket: WebSocket | null = null
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 10
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private isIntentionalClose: boolean = false
  private isAuthenticated: boolean = false
  private authData: any = null

  // Cache token để tránh gọi getAuthen() nhiều lần
  private cachedToken: string | null = null

  constructor(authenService: AuthenticationService, baseURL: string) {
    this.authenService = authenService
    this.BASE_URL = baseURL
    if (!SocketService.instance) {
      SocketService.instance = this
    }
    return SocketService.instance
  }

  // ============= CONNECTION =============

  connect = async (): Promise<void> => {
    try {
      console.log("[WS] Connecting...")

      // Ngắt kết nối cũ nếu còn
      if (this.socket) {
        this._cleanupSocket()
      }

      this.isIntentionalClose = false
      this.isAuthenticated = false

      // Lấy và cache token
      this.cachedToken = await this.authenService.getAuthen()

      const ws = this._createWebSocket()
      this.socket = ws

      return new Promise<void>((resolve, reject) => {
        if (!this.socket) return reject(new Error("No socket"))

        // Timeout kết nối 10s
        const connectionTimeout = setTimeout(() => {
          reject(new Error("[WS] Connection timeout"))
          this._cleanupSocket()
        }, 10000)

        this.socket.onopen = async () => {
          clearTimeout(connectionTimeout)
          console.log("[WS] Connected ✓")
          this.reconnectAttempts = 0
          await this._sendAuth()
          resolve()
        }

        this.socket.onmessage = (event) => {
          this._handleMessage(event)
        }

        this.socket.onerror = (error) => {
          clearTimeout(connectionTimeout)
          console.error("[WS] Error:", error)
          reject(error)
        }

        this.socket.onclose = (event) => {
          console.log("[WS] Closed:", {
            code: event.code,
            reason: event.reason || "No reason",
            wasClean: event.wasClean,
            intentional: this.isIntentionalClose,
          })

          this._stopHeartbeat()
          this.isAuthenticated = false
          this.authData = null

          if (!this.isIntentionalClose && this.reconnectAttempts < this.maxReconnectAttempts) {
            this._scheduleReconnect()
          } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error("[WS] Max reconnect attempts reached")
          }
        }
      })
    } catch (err) {
      console.error("[WS] Connect error:", err)
      throw err
    }
  }

  private _createWebSocket = (): WebSocket => {
    if (this.cachedToken) {
      return new (WebSocket as any)(this.BASE_URL, [], {
        headers: {
          Authorization: `Bearer ${this.cachedToken}`,
        },
      })
    }
    return new WebSocket(this.BASE_URL)
  }

  // Exponential backoff: 2s → 4s → 8s → 16s → ... → max 30s
  private _scheduleReconnect = () => {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }

    this.reconnectAttempts++
    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY_MS,
    )

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch((err) => {
        console.error("[WS] Reconnect failed:", err)
      })
    }, delay)
  }

  disconnect = () => {
    try {
      console.log("[WS] Disconnecting...")
      this.isIntentionalClose = true

      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout)
        this.reconnectTimeout = null
      }

      this._stopHeartbeat()
      this._cleanupSocket()

      this.isAuthenticated = false
      this.authData = null
      this.cachedToken = null
      this.reconnectAttempts = 0

      console.log("[WS] Disconnected ✓")
    } catch (error) {
      console.error("[WS] Disconnect error:", error)
    }
  }

  private _cleanupSocket = () => {
    if (!this.socket) return

    // Xóa tất cả handlers trước để tránh trigger reconnect
    this.socket.onopen = null
    this.socket.onmessage = null
    this.socket.onerror = null
    this.socket.onclose = null

    if (
      this.socket.readyState === WebSocket.OPEN ||
      this.socket.readyState === WebSocket.CONNECTING
    ) {
      this.socket.close()
    }

    this.socket = null
  }

  // ============= AUTH =============

  private _sendAuth = async () => {
    try {
      if (this.socket?.readyState !== WebSocket.OPEN) return

      // Dùng cached token, không gọi lại getAuthen()
      const token = this.cachedToken || (await this.authenService.getAuthen())

      const message = {
        destination: DESTINATIONS.AUTH,
        data: { token },
      }

      this.socket.send(JSON.stringify(message))
      console.log("[WS] Auth sent (tokenLength:", token?.length ?? 0, ")")
    } catch (e) {
      console.error("[WS] Auth send error:", e)
    }
  }

  // ============= HEARTBEAT =============

  private _startHeartbeat = () => {
    this._stopHeartbeat()
    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        const ping = {
          destination: DESTINATIONS.PING,
          data: { timestamp: Date.now() },
        }
        this.socket.send(JSON.stringify(ping))
      } else {
        // Socket không còn mở, dừng heartbeat
        this._stopHeartbeat()
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  private _stopHeartbeat = () => {
    if (this.heartbeatInterval) {

        clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  // ============= MESSAGE HANDLING =============

  private _handleMessage = (event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data)

      // AUTH SUCCESS
      if (message.destination === RESPONSE_DESTINATIONS.AUTH_SUCCESS) {
        console.log("[WS] Auth success ✓")
        this.isAuthenticated = true
        this.authData = message.data
        this._startHeartbeat()
        return
      }

      // SERVER ERROR → logout
      if (message.status === "error" || message.destination === RESPONSE_DESTINATIONS.ERROR) {
        console.error("[WS] Server error:", message?.message || message)
        this.isAuthenticated = false
        replace("LoginScreen")
        return
      }

      // PONG (heartbeat response)
      if (message.destination === SYSTEM_DESTINATIONS.PONG && message.status === "pong") {
        // Xử lý im lặng — không cần log
        return
      }

      // BUSINESS EVENTS
      if (message.destination) {
        const { destination, data } = message

        switch (destination) {
          case EVENT_TYPES.FOUND_GO:
            this._onFoundGo(data)
            break
          case EVENT_TYPES.CHAT:
            this._onChat(data)
            break
          case EVENT_TYPES.CANCEL_GO:
            this._onCancelGo(data)
            break
          case EVENT_TYPES.UPDATE_DISTANCE:
            this._onUpdateDistancePassersby(data)
            break
          case EVENT_TYPES.GRAB_PASSERSBY:
            this._onGrabPassersby(data)
            break
          default:
            console.log("[WS] Unhandled destination:", destination)
        }
      }
    } catch (err) {
      console.error("[WS] Parse message error:", err)
    }
  }

  // ============= SEND MESSAGE =============

  private _sendMessage = (eventType: string, data: any, eventId?: string) => {
    if (!this.isAuthenticated) {
      console.warn("[WS] Not authenticated, drop message:", eventType)
      return
    }

    if (this.socket?.readyState !== WebSocket.OPEN) {
      console.warn("[WS] Socket not open. State:", this.socket?.readyState)
      return
    }

    try {
      const message = {
        event_type: eventType,
        event_id: eventId || `${eventType}-${Date.now()}`,
        timestamp: Date.now(),
        version: "1.0",
        data,
      }
      this.socket.send(JSON.stringify(message))
    } catch (error) {
      console.error("[WS] Send error:", error)
    }
  }

  // ============= PUBLIC METHODS =============

  _doUpdateLocation = (location: Coordinate) => {
    if (!this.isAuthenticated) return
    if (this.socket?.readyState !== WebSocket.OPEN) return

    try {
      const message = {
        destination: DESTINATIONS.PING,
        data: {
          lat: location.lat,
          lng: location.lng,
        },
      }
      this.socket.send(JSON.stringify(message))
    } catch (error) {
      console.error("[WS] Update location error:", error)
    }
  }

  _doAcceptRide = async (goID: number) => {
    try {
      const phone = await this.authenService.getPhone()
      this._sendMessage(EVENT_TYPES.ACCEPT_RIDE, {
        goID,
        accessToken: this.cachedToken,
        phone,
      })
    } catch (error) {
      console.error("[WS] Accept ride error:", error)
    }
  }

  _doGrabPassersby = (goID: number) => {
    this._sendMessage(EVENT_TYPES.GRAB_PASSERSBY, {
      accessToken: this.cachedToken,
      goID,
    })
  }

  _doUpdateDistancePassersby = (goID: number, distance: number) => {
    this._sendMessage(EVENT_TYPES.UPDATE_DISTANCE, {
      accessToken: this.cachedToken,
      goID,
      distance,
    })
  }

  onGrabPassersby = (orderBooking: any) => {
    this._sendMessage(EVENT_TYPES.GRAB_PASSERSBY, {
      accessToken: this.cachedToken,
      ...orderBooking,
    })
  }

  _doChat = (goID: number, content: string) => {
    this._sendMessage(EVENT_TYPES.CHAT, {
      goID,
      accessToken: this.cachedToken,
      type: 2,
      content,
    })
  }

  _subscribeOnChat = (goID: number) => {
    this._sendMessage("subscribeChat", {
      goID,
      accessToken: this.cachedToken,
    })
  }

  // ============= EVENT HANDLERS =============

  private _onFoundGo = (data: any) => {
    console.log("[WS] FOUND_GO:", data)
    EventEmitter.emit(Event.ON_FOUNDGO, data)
  }

  private _onCancelGo = (data: any) => {
    console.log("[WS] CANCEL_GO:", data)
    EventEmitter.emit(Event.ON_CANCEL_GO, data)
  }

  private _onChat = (data: any) => {
    EventEmitter.emit(Event.ON_CHAT, data)
  }

  private _onGrabPassersby = (data: any) => {
    EventEmitter.emit(Event.ON_GRAB_PASSERS_BY, data)
  }

  private _onUpdateDistancePassersby = (data: any) => {
    EventEmitter.emit(Event.ON_UPDATE_DISTANCE_PASSERS_BY, data)
  }

  // ============= GETTERS =============

  getAuthData = () => this.authData

  isAuth = () => this.isAuthenticated

  getConnectionState = () => ({
    readyState: this.socket?.readyState,
    isAuthenticated: this.isAuthenticated,
    reconnectAttempts: this.reconnectAttempts,
    isIntentionalClose: this.isIntentionalClose,
  })
}

export default SocketService