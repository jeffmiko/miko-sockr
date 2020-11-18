const WebSocket = require("ws");
const { EventEmitter } = require("events")

class SockrChannel extends EventEmitter {

  #id = null 
  #app = null 
  #name = null
  #broadcast = null
  #clients = new Set()

  constructor({name, app, id, broadcast} ={}) {
    super({name, app, id, broadcast})
    this.#app = app 
    this.#name = name
    this.#broadcast = broadcast
    this.#id = id
  }

  join(client) {
    if (!client) throw new TypeError("A client socket is required.")
    if (this.#clients.has(client)) return this
    this.emit("joining", client, this.#name)
    this.#clients.add(client)
    this.emit("joined", client, this.#name)
    return this
  }

  leave(client) {
    if (!client) throw new TypeError("A client socket is required.")
    if (!this.#clients.has(client)) return this
    this.emit("leaving", client, this.#name)
    this.#clients.delete(client)
    this.emit("left", client, this.#name)
    return this
  }

  // TODO: maybe include origin in channel?

  send(data, excluded) {
    let json = JSON.stringify(data)
    // send to all local clients except excluded
    for (let client of this.#clients) {
      try {        
        if (excluded) {
          if (client === excluded) continue
          if (client.id && excluded.id && client.id === excluded.id ) continue
        }
        if (client.readyState === WebSocket.OPEN) {
          client.send(json);
        }
      } catch { }
    }

    // broadcast to other apps if enabled
    if (this.#broadcast) {
      // check if app is excluded
      if (excluded) {
        if (this.#app === excluded) return this
        if (this.#id && excluded.id && this.#id === excluded.id ) return this
      }
  
      try {
        // tell app to broadcast to others via Redis
        let context = {
          header: { channel: this.#name, origin: this.#id},
          data
        }
        json = JSON.stringify(context)
        this.#broadcast(json)        
      } catch { }
    }
    return this
  }

  hasJoined(client) {
    return this.#clients.has(client)
  }

  hasClients() {
    return this.#clients.size > 0
  }

}



module.exports.SockrChannel = SockrChannel
