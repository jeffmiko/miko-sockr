const WebSocket = require("ws");
const { EventEmitter } = require("events")
const SockrUtils = require("./SockrUtils")


class SockrChannel extends EventEmitter {

  #broadcast = null
  #clients = new Set()

  constructor(name, broadcast) {
    super()
    // read-only id property
    Object.defineProperty(this, "name", {
      value: name
    });    
    this.#broadcast = broadcast
  }

  join(client) {
    if (!client) throw new TypeError("A client socket is required.")
    if (this.#clients.has(client)) return this
    this.#clients.add(client)
    this.emit("joined", { client, name: this.name})
    return this
  }

  leave(client) {
    if (!client) throw new TypeError("A client socket is required.")
    if (!this.#clients.has(client)) return this
    this.#clients.delete(client)
    this.emit("left", { client, name: this.name })
    return this
  }

  hasJoined(client) {
    return this.#clients.has(client)
  }

  hasClients() {
    return this.#clients.size > 0
  }

  getClients() {
    return this.#clients.values()
  }

  /**
   * @deprecated Use broadcast instead.
   */
  send(response, client) {
    if (client)
      this.broadcast({ response, client })
    else
      this.broadcast({ response })
  }

  broadcast(context, all=false) {
    if (!this.#broadcast) throw new Error("A broadcast function does not exist.")
    context = SockrUtils.checkBroadcast(context, all)
    context.response.header.channel = this.name
    this.#broadcast(context)
    return this
  }

  all(context) {
    return this.broadcast(context, true)
  }  


}



module.exports = SockrChannel
