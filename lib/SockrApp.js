const WebSocket = require('ws');
const crypto = require("crypto");
const SockrHooks  = require("./SockrHooks")
const SockrAuth  = require("./SockrAuth")
const SockrParser  = require("./SockrParser")
const SockrChannel = require("./SockrChannel")
const SockrUtils = require("./SockrUtils")

function noop() {}
function heartbeat() { this.isAlive = true }


class SockrApp extends SockrHooks {
  #methods = {}
  #services = {}
  #server = null
  #channels = {}

  constructor(options = {}) {
    super()
    // read-only id property
    Object.defineProperty(this, "id", {
      value: crypto.randomBytes(16).toString('hex') 
    });
    if (!options.auth) options.auth = SockrAuth.jwt()
    Object.defineProperty(this, "auth", {
      value: options.auth
    });    
    if (!options.parser) options.parser = SockrParser.json()
    Object.defineProperty(this, "parser", {
      value: options.parser
    });    

  }

  use(name, service, methods) {
    if (!methods) {
      methods = new Set();
      let currentObj = service
      do {
        if (["SockrHooks", "Object"].includes(currentObj.constructor.name)) break
        Object.getOwnPropertyNames(currentObj).map(name => {
          if (name != "constructor" && typeof currentObj[name] === "function" ) {
            methods.add(name)
          }
        })
      } while ((currentObj = Object.getPrototypeOf(currentObj)))
      if (methods.size == 0) throw new TypeError("No instance methods found.")
    } else if (!Array.isArray(methods)) {
      throw new TypeError("The methods parameter must be an array.")
    } else if (methods.length == 0) {
      throw new TypeError("No instance methods found.")
    } else {
      // check to make sure service has methods
      for(let m of methods) {
        if (typeof service[m] !== "function") {
          throw new TypeError(`The service does not contain a ${m} method.`)
        }
      }
    }
    this.#methods[name] = methods 
    this.#services[name] = service
    return this
  }

  service(name) {
    let svc =  this.#services[name]
    if (!svc) throw new TypeError(`The service ${name} could not be found.`)
    return svc
  }

  server(server) {
    const app = this
    this.#server = server
    server.on('connection', async (websocket, request) => {
      // assign unique id to socket
      websocket.id = crypto.randomBytes(16).toString('hex')
      try {
        // authenticate if needed
        if (app.auth) await app.auth(websocket, request)
      } catch (error) {
        websocket.close(1008, "Unauthorized")
        request.socket.destroy()
        app.emit("unauthorized", { error, client: websocket, request })
        return    
      }
      
      // add heart beat
      websocket.isAlive = true;
      websocket.on('pong', heartbeat);

      // fire connection event
      app.emit("connection", { client:websocket, request })

      if (websocket.readyState === WebSocket.CONNECTING || 
          websocket.readyState === WebSocket.OPEN) {

        // process messages
        websocket.on('message', async (data) => {
          try {
            let context = await this.parser(data)
            context.client = websocket
            await app.dispatch(context)            
          } catch (error) {
            app.emit("error", { error, client: websocket, request })           
          }
        })
      
        // handle client close/disconnect
        websocket.on('close', () => { 
          try {
            // leave all channels on disconnect
            for(let ch of app.channelScan(websocket)) {
              try {
                ch.leave(ws)
              } catch {  }
            }
            app.emit("close", { client: websocket, request })          
          } catch (error) { 
            app.emit("error", { error, client: websocket, request })           
          }
        });
      }
    
    });    

    // every 30 seconds ping clients to check connectivity
    const pingInterval = setInterval(() => {
      try {
        server.clients.forEach((ws) => {
          if (ws.isAlive === false) return ws.terminate();     
          ws.isAlive = false;
          ws.ping(noop);
        });
      } catch {}
    }, 30000);
         
    // check channels every so often
    const channelInterval = setInterval(() => {
      try {
        for(let key of Object.keys(this.#channels)) {
          if (!this.#channels[key].hasClients()) {
            delete this.#channels[key]
          }
        }
      } catch {}
    }, 90000)

    // when server stops remove intervals
    server.on('close', () => {
      clearInterval(pingInterval)
      clearInterval(channelInterval)
    })

  }

  listen(port) {
    const wss = new WebSocket.Server({ port });
    this.server(wss)
  }

  close() {
    if (this.#server) {
      this.#server.close()
      this.#server = null
    }
  }

  async dispatch(context) {
    let errorfn = this.#errorHandler.bind(this)
    errorfn = this.hooks().error() || errorfn
    if (!context) context = { error: new Error("A null or undefined context was dispatched.") }
    if (!context.app) context.app = this
    if (!context.error) {
      try {
        
        if (!context.client) throw new TypeError("No client found.")
        if (!context.request) throw new TypeError("No request found.")
        if (!context.request.header) throw new TypeError("No header found on request.")
        if (!context.request.header.service) throw new TypeError("No service found on message header.")
        if (!context.request.header.method) throw new TypeError("No method found on message header.")

        if (!context.request.header.id) context.request.header.id = crypto.randomBytes(16).toString('hex')
        context.response.header = context.request.header
        
        let header = context.request.header 
        // check for service
        let service = this.#services[header.service]
        if (!service) throw new TypeError(`Service ${header.service} not found`)
        errorfn = service.hooks().error() || errorfn

        // check for method
        let method = this.#methods[header.service].has(header.method)
        if (!method) throw new TypeError(`Method ${header.method} not found in service ${header.service}`)
        errorfn = service.hooks(header.method).error() || errorfn

        // before hooks = app, service, method
        for(let fn of this.hooks().before()) {
          await fn(context)
          if (context.stop) return context
        }
        for(let fn of this.hooks(header.method).before()) {
          await fn(context)
          if (context.stop) return context
        }        
        for(let fn of service.hooks().before()) {
          await fn(context)
          if (context.stop) return context
        }
        for(let fn of service.hooks(header.method).before()) {
          await fn(context)
          if (context.stop) return context
        }
        
        // service call
        if (context.response.data === undefined)
          context.response.data = await service[header.method](context.request.params)
        if (context.stop) return context

        // after hooks - method, service, app
        for(let fn of service.hooks(header.method).after()) {
          await fn(context)
          if (context.stop) return context
        }
        for(let fn of service.hooks().after()) {
          await fn(context)
          if (context.stop) return context
        }
        for(let fn of this.hooks(header.method).after()) {
          await fn(context)
          if (context.stop) return context
        }        
        for(let fn of this.hooks().after()) {
          await fn(context)
          if (context.stop) return context
        }

        // send response to client if exists
        if (context.response && context.response.data) {
          let json = JSON.stringify(context.response)
          context.client.send(json)
        }

      } catch (error) {
        try {
          context.error = error
          await errorfn(context)
        } catch { }
      }
    } else {
      try {
        await errorfn(context)
      } catch { }
    }
    return context
  }

  #errorHandler(context) {
    this.emit("error", context) 
    if (!context.stop) {
      let msg = { header: context.request.header }
      if (context.error) {
        msg.error = {
          name: context.error.name || "UnknownError",
          message: context.error.statusText || context.error.message || "Unknown server error",
          code: context.error.status || context.error.statusCode || context.error.code || 500
        }
      } else {
        msg.error = {
          name: "UnknownError",
          message: "Unknown server error",
          code: 500
        }
      }
      try {
        let json = JSON.stringify(msg)
        context.client.send(json)          
      } catch {
      }
    }
  }

  broadcast(context, all=false) {
    context = SockrUtils.checkBroadcast(context, all)
    let list = []
    let data = JSON.stringify(context.response)
    if (context.response.header.channel) {
      list = this.channel(context.response.header.channel).getClients()
    } else {
      list = this.#server.clients.values()
    }

    for(let client of list) {
      if (context.response.header.origin && client.id == context.response.header.origin) continue;
      if (client.readyState === WebSocket.OPEN) {
        client.send(data)
      }
    }
    return this
  }

  all(context) {
    return this.broadcast(context, true)
  }

  channel(name) {
    if (!this.#channels[name]) {
      let ch = new SockrChannel(
        name, 
        this.broadcast.bind(this)
      )
      // surface events to app listeners
      ch.on("joined", ({client, name}) => this.emit("joined", {client, name}) )
      ch.on("left", ({client, name}) => this.emit("left", {client, name}) )
      this.#channels[name] = ch
    }
    return this.#channels[name]
  }  

  channelScan(client) {
    let result = []
    for(let ch of Object.values(this.#channels)) {
      if (ch.hasJoined(client)) result.push(ch)
    }
    return result
  }


}


module.exports = SockrApp
module.exports.SockrApp = SockrApp
