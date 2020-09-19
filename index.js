const crypto = require("crypto");
const qs = require("querystring");

const WebSocket = require("ws");
const EventEmitter = require('events');
const jwt = require("jsonwebtoken");

function noop() {}
function heartbeat() { this.isAlive = true; }


class SocketRouter extends EventEmitter {
  
  #stack = []
  #caseInsensitive = false
  id = null

  constructor({caseInsensitive = false} = {}) {
    super()
    this.#caseInsensitive = caseInsensitive
    this.id = this.generateUniqueId()
  }

  // ex: use([func1, func2, func3])
  // ex: use("service", [func1, func2, func3])
  // ex: use("service", "action", [func1, func2, func3])
  // ex: use(SocketRouter)
  use() {
    let services = {}
    let actions = {}
    let functions = []
    
    if (arguments.length == 0) throw new Error("No arguments passed to function.")

    if (arguments[0] instanceof SocketRouter) {
      this.#stack.push(arguments[0])
    } else {
      // can take single parameter
      for(let i =0; i < arguments.length; i++) {
        if (typeof arguments[i] === "string") {
          let key = this.#caseInsensitive ? arguments[i].toLowerCase() : arguments[i]
          if (!key) continue
          if (Object.keys(services).length == 0)
            services[key] = true
          else if (Object.keys(actions).length == 0)
            actions[key] = true
          else 
            throw new TypeError("Too many string arguments passed to funciton.")
        } else if (typeof arguments[i] === "function") {
          functions.push(arguments[i])
        } else if (typeof arguments[i] === "object" && Array.isArray(arguments[i])) {
            if (arguments[i].length == 0) throw new TypeError("Arrays cannot be empty")
            if (typeof arguments[i][0] === "string") {
              let dict = {}
              for(let key of arguments[i]) {
                if (typeof key !== "string") 
                  throw new TypeError("Array elements must all be the same type.")
                if (!key) continue
                if (this.#caseInsensitive)
                  dict[key.toLowerCase()] = true
                else
                  dict[key] = true
              }
              if (Object.keys(services).length == 0)
                services = { ...services, ...dict }
              else if (Object.keys(actions).length == 0)
                actions = { ...actions, ...dict }
              else 
                throw new TypeError("Too many strings or arrays of strings passed to function.")
            } else if (typeof arguments[i][0] === "function") {
              for(let a of arguments[i]) {
                if (typeof a !== "function") 
                  throw new TypeError("Array elements must all be the same type.")
                functions.push(a)
              }
            } else {
              throw new TypeError("Argument arrays must be arrays of strings or functions")
            }
        } else {
          throw new TypeError("Arguments must be strings, functions or arrays of strings or functions")
        }
      }
      if (functions.length == 0) throw new Error("Must have at least on function handler.")
      if (Object.keys(services).length == 0) services = "all"
      if (Object.keys(actions).length == 0) actions = "all"
      this.#stack.push({ services: services, actions: actions, functions })
    }
    return this
  }

  // process route handlers
  handle(context) {
    for(let s of this.#stack) {
      try {
        if (s instanceof SocketRouter) {
          s.handle(context) 
        } else {
          // check if service valid
          if (s.services === "all" || (context.service && s.services[context.service])) {
            // check if action valid
            if (s.actions === "all" || (context.action && s.actions[context.action])) {
              try {
                // call each function handler
                for(let fn of s.functions) {
                  fn(context)
                }
              } catch (error) {
                context.error = error                
              }
            }
          }
        }
      } catch (error) {
        context.error = error        
      }
    }
  }

  makeContext({socket, service, action, data} = {}) {
    if (!socket) throw TypeError("A socket is required")
    // generate unique id for this socket if it doesn't exist
    if (!socket.id) socket.id = crypto.randomBytes(16).toString('hex');
    return {socket, service, action, data}    
  }

  generateUniqueId() {
    return crypto.randomBytes(16).toString('hex')
  }

}

class SocketChannels extends EventEmitter {
  #redisPrefix = "sockr#channels#"
  #caseInsensitive = false
  #channels = { }
  #sockets = { }
  #pub = null
  #sub = null
  id = crypto.randomBytes(16).toString('hex')

  constructor(options = {}) {
    super()
    this.#caseInsensitive = options.caseInsensitive
    if (options.redis) {
      const redis = require("redis");
      this.#pub = redis.createClient(options.redis)
      this.#sub = redis.createClient(options.redis)
      this.#sub.psubscribe(this.#redisPrefix+"*", function(err){
        //if (err) self.emit('error', err);
      });
      this.#sub.on('pmessage', this.onmessage.bind(this));
    } 
  }

  join(socket, name) {
    if (!socket) throw new TypeError("A socket with an id is required.")
    if (!socket.id) socket.id = crypto.randomBytes(16).toString('hex')
    if (!name) throw new TypeError("A channel name is required.")
    if (this.#caseInsensitive) name = name.toLowerCase()
    let channel = this.#channels[name]
    if (!channel) {
      channel = {}
      this.#channels[name] = channel
    }
    this.emit("beforeJoin", socket, name)
    channel[socket.id] = socket
    if (!this.#sockets[socket.id]) this.#sockets[socket.id] = {}
    this.#sockets[socket.id][name] = true
    this.emit("afterJoin", socket, name)
    return this
  }  

  leave(socket, name) {
    if (!socket || !socket.id) throw new TypeError("A socket with an id is required.")
    if (!name) throw new TypeError("A channel name is required.")
    if (this.#caseInsensitive) name = name.toLowerCase()
    this.emit("beforeLeave", socket, name)
    let channel = this.#channels[name]
    if (channel) {
      // remove socket from channel
      delete channel[socket.id]
    }
    let list = this.#sockets[socket.id]
    if (list) {
      // remove channel from socket's list
      delete list[name] 
      if (Object.keys(list).length == 0)
        delete this.#sockets[socket.id]
    }
    this.emit("afterLeave", socket, name)
    return this
  }  

  clear(socket) {
    if (this.#sockets[socket.id]) {
      let channels = Object.keys(this.#sockets[socket.id])
      for(let name of channels) {
        this.leave(socket, name)
      }
      delete this.#sockets[socket.id]
    }
    return this
  }

  list(socket) {
    if (this.#sockets[socket.id]) {
      return Object.keys(this.#sockets[socket.id])
    } else {
      return []
    }
  }
    

  async send(name, data, source=null) {
    let msg = {
      header: {
        channel: name,
        server: this.app ? this.app.id : this.id,
        client: source,
      },
      payload: data
    }
    if (this.#pub) {
      let json = JSON.stringify(msg)
      this.#pub.publish(this.#redisPrefix+"broadcast", json)
    } else {
      msg.header.server = "internal"
      let json = JSON.stringify(msg)
      this.onmessage(this.#redisPrefix+"*", this.#redisPrefix+"broadcast", json)
    }
    return this
  }

  onmessage(pattern, action, text) {
    action = action.substr(this.#redisPrefix.length)
    try {
       let data = JSON.parse(text)
       switch(action) {
        case "broadcast":
          this.onbroadcast(data)
          break
        default:
          break
       }
    } catch (error) {
      // PUBLISH sockr#broadcast#everyone '{"name": "jeff"}'
      console.log("onmessage error:", error.message)
    }
  }  

  onbroadcast(data) {
    let {header, payload} = data
    let channel = this.#channels[header.channel] 
    if (channel) {
      let clients = Object.values(channel)
      try {        
        let json = JSON.stringify(payload)
        for(let client of clients) {
          if (header && header.client && header.client == client.id) continue
          if (client.readyState === WebSocket.OPEN) {
            client.send(json);
          }
        }
      } catch (error) {
      }
    }    
  }

}

class SocketRouterApp extends SocketRouter {

  constructor({caseInsensitive = false, redis = false} = {}) {
    super({caseInsensitive})
    this.channels = new SocketChannels({caseInsensitive, redis})
    this.channels.app = this
  }


  // create context and process route handlers
  dispatch(context) {
    if (!context) throw TypeError("A context is required")
    if (!context.socket) throw TypeError("A context must have a socket")
    // generate unique id for this socket if it doesn't exist
    if (!context.socket.id) context.socket.id = this.generateUniqueId()
    // attach app dispatching handlers
    context.app = this
    this.handle(context)
  }

  json() {
    let app = this
    return function(text) {
      let context = null
      try {
        let msg = JSON.parse(text)
        context = app.makeContext({socket: this, ...msg})
        context.raw = msg
        if (!context.service) context.error = TypeError("No service found on message.")
        if (!context.action) context.error = TypeError("No action found on message.")
      } catch (error) {
        context = app.makeContext({socket: this, error})
        context.raw = text 
      }
      app.dispatch(context)
    }
  }

  jwt(options) {
    let {header, query} = options
    if (!header && !query) {
      header = "Bearer"
      query = "token"
    }
    if (header) header = header.trim()+" "
    const socketProperty = options.socketProperty || "user"
    options.complete = true

    return function(ws, req) {
      let token = null
      if (header && req.headers && req.headers.authentication && req.headers.authentication.startsWith(header)) {
        token = req.headers.authentication.substr(header.length)
      } else if (query) {
        let pos = req.url.indexOf("?")
        if (pos) {
          let params = qs.parse(req.url.substr(pos+1)) 
          if (params[params]) token = params[params]
        }
      }
      if (token) {
        let decoded = jwt.verify(token, options.secret, options)
        ws[socketProperty] = decoded.payload
      } else {
        throw new Error("Authorization token not found.")
      }      
    }
  }

  server(wss, auth, handler) {

    if (!handler) handler = this.json()

    wss.on('connection', (ws, req) => {

      try {
        if (auth) auth(ws, req)
      } catch (error) {
        ws.close(1008, "Unauthorized")
        req.socket.destroy()
        return    
      }
    
      // add heart beat
      ws.isAlive = true;
      ws.on('pong', heartbeat);

      this.emit("connection", ws, req)

      // message handler
      ws.on('message', handler )
    
      // leave all channels
      ws.on('close', () => { 
        this.channels.clear(ws); 
        this.emit("close", ws, req)
      });
    
    });


    const interval = setInterval(function ping() {
      wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) return ws.terminate();     
        ws.isAlive = false;
        ws.ping(noop);
      });
    }, 30000);
     
    wss.on('close', function close() {
      clearInterval(interval);
    });

  }

}

function app(options = {}) {
  let router = new SocketRouterApp(options)
  return router
}

function router(options = {}) {
  let router = new SocketRouter(options)
  return router
}


module.exports.app = app;
module.exports.router = router;


