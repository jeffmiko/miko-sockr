const loget = require("lodash.get");
const loset = require("lodash.set");


class SockrAfterHooks {

  /** Removes fields that are null from the response data. Checks the fields provided or all fields if none provided. */
  static stripNulls(fields) {
    if (fields && fields.length > 0) {
      return async(context) => {
        if (context && context.response && context.response.data) {
          if (Array.isArray(context.response.data)) {
            for(let i=0; i < context.response.data.length;i++) {
              for(let f of fields) {
                if (context.response.data[i][f] === null)
                  delete context.response.data[i][f]
              }  
            }
          } else {
            for(let f of fields) {
              if (context.response.data[f] === null)
                delete context.response.data[f]
            }
          }
        }
      }
    } else {
      return async(context) => {
        if (context && context.response && context.response.data) {
          if (Array.isArray(context.response.data)) {
            for(let i=0; i < context.response.data.length;i++) {
              for(let f of Object.keys(context.response.data[i])) {
                if (context.response.data[i][f] === null)
                  delete context.response.data[i][f]
              }  
            }
          } else {
            for(let f of Object.keys(context.response.data)) {
              if (context.response.data[f] === null)
                delete context.response.data[f]
            } 
          }
        }
      }
    }
  }

  /** Removes empty fields from the response data. Checks the fields provided or all fields if none provided. */
  static stripEmpty(fields) {
    if (fields && fields.length > 0) {
      return async(context) => {
        if (context && context.response && context.response.data) {
          if (Array.isArray(context.response.data)) {
            for(let i=0; i < context.response.data.length;i++) {
              for(let f of fields) {
                if (context.response.data[i][f] === null || context.response.data[i][f] === "")
                  delete context.response.data[i][f]
              }  
            }
          } else {
            for(let f of fields) {
              if (context.response.data[f] === null || context.response.data[f] === "")
                delete context.response.data[f]
            }
          }
        }
      }
    } else {
      return async(context) => {
        if (context && context.response && context.response.data) {
          if (Array.isArray(context.response.data)) {
            for(let i=0; i < context.response.data.length;i++) {
              for(let f of Object.keys(context.response.data[i])) {
                if (context.response.data[i][f] === null || context.response.data[i][f] === "")
                  delete context.response.data[i][f]
              }  
            }
          } else {
            for(let f of Object.keys(context.response.data)) {
              if (context.response.data[f] === null || context.response.data[f] === "")
                delete context.response.data[f]
            } 
          }
        }
      }
    }
  }

  /** Removes the specified fields from the response data */
  static stripFields(fields) {
    if (!fields || fields.length == 0) throw new TypeError("Must pass a list of fields")
    return async(context) => {
      if (context && context.response && context.response.data) {
        if (Array.isArray(context.response.data)) {
          for(let i=0; i < context.response.data.length;i++) {
            for(let f of fields) {
              delete context.response.data[i][f]
            }  
          }
        } else {
          for(let f of fields) {
            delete context.response.data[f]
          }
        }
      }
    }
  }

  /** Adds an stopTime (Date) property of the response header */
  static addStopTime = () => {
    return async(context) => {
      if (context) {
        if (context.response && context.response.header) {
          context.response.header.stopTime = new Date()          
        }
      }
    }
  }  

  /** Adds an elapsedTime (ms) property of the response header */
  static addElapsedTime = () => {
    return async(context) => {
      if (context && context.startTime) {
        if (context.response && context.response.header) {
          context.response.header.elapsedTime = Date.now() - context.startTime
        }
      }
    }
  }  

  /** Converts fields with date strings to Date objects */
  static parseDates(fields) {
    if (!fields || fields.length == 0) throw new TypeError("Must pass a list of fields")
    return async(context) => {
      if (context && context.response && context.response.data) {
        if (Array.isArray(context.response.data)) {
          for(let i=0; i < context.response.data.length;i++) {
            for(let f of fields) {
              if (typeof context.response.data[i][f] === "string") {
                try {
                  let dt = dayjs(context.response.data[i][f])
                  dt = dt.toDate()
                  if (!isNaN(dt.getTime()))
                    context.response.data[i][f] = dt                  
                } catch { }
              }              
            }  
          }
        } else {
          for(let f of fields) {
            if (typeof context.response.data[f] === "string") {
              try {
                let dt = dayjs(context.response.data[f])
                dt = dt.toDate()
                if (!isNaN(dt.getTime()))
                  context.response.data[f] = dt                  
              } catch { }
            }  
          }
        }
      }
    }
  }

  /** Converts fields with date strings to Date objects */
  static formatDates(fields, format) {
    if (!fields || fields.length == 0) throw new TypeError("Must pass a list of fields")
    return async(context) => {
      if (context && context.response && context.response.data) {
        if (Array.isArray(context.response.data)) {
          for(let i=0; i < context.response.data.length;i++) {
            for(let f of fields) {
              try {
                let dt = dayjs(context.response.data[i][f])
                if (dt.isValid()) {
                  if (format) context.response.data[i][f] = dt.format(format)
                  else context.response.data[i][f] = dt.format()
                }
              } catch { }
            }  
          }
        } else {
          for(let f of fields) {
            try {
              let dt = dayjs(context.response.data[f])
              if (dt.isValid()) {
                if (format) context.response.data[f] = dt.format(format)
                else context.response.data[f] = dt.format()
              }
            } catch { }
          }
        }
      }
    }
  }

  /** Sets a value to the Redis cache using key fields from the request parameters */
  static setCache(redis, prefix, keys, ttl, sep) {
    if (!redis) throw new TypeError("The redis parameter is missing.")
    if (typeof redis.set !== "function") TypeError("The redis parameter must be an instance of RedisClient.")
    if (typeof redis.setex !== "function") TypeError("The redis parameter must be an instance of RedisClient.")
    if (!prefix) throw new TypeError("The prefix parameter is missing.")
    if (!keys) throw new TypeError("The keys parameter is missing.")
    if (!Array.isArray(keys)) keys = [keys]
    if (!sep) sep = "-"

    return async(context) => {
      if (context && context.request && context.request.params) {
        if (context.response.cached) return
  
        let items = [prefix]
        for(let key of keys) {
          if (!context.request.params[key]) return
          items.push(context.request.params[key])
        }
        let key = items.join(sep)
        let json = JSON.stringify(context.response.data)
        if (ttl)
          return new Promise( (resolve,reject) => {
            redis.setex(key, ttl, json, function(err, res) {
              try {
                if (err) resolve(null)
                else {
                  context.response.cached = true
                  resolve(res)              
                }
              } catch (error) {
                resolve(null)
              }
            });  
          });
        else
          return new Promise( (resolve,reject) => {
            redis.set(key, json, function(err, res) {
              try {
                if (err) resolve(null)
                else {
                  context.response.cached = true
                  resolve(res)              
                }
              } catch (error) {
                resolve(null)
              }
            });  
          });
      }
    }
  }

  /** Deletes a value from Redis cache using key fields from the request parameters */
  static delCache(redis, prefix, keys, sep) {
    if (!redis) throw new TypeError("The redis parameter is missing.")
    if (typeof redis.del !== "function") TypeError("The redis parameter must be an instance of RedisClient.")
    if (!prefix) throw new TypeError("The prefix parameter is missing.")
    if (!keys) throw new TypeError("The keys parameter is missing.")
    if (!Array.isArray(keys)) keys = [keys]
    if (!sep) sep = "-"
    return async(context) => {
      if (context && context.request && context.request.params) {
        let items = [prefix]
        let keysfound = 0
        for(let key of keys) {
          if (!context.request.params[key]) return
          items.push(context.request.params[key])
          keysfound++
        }
        if (keysfound == keys.length) {
          let key = items.join(sep)
          return new Promise( (resolve,reject) => {
            redis.del(key, function(err, res) {
              try {
                if (err) resolve(null)
                else resolve(res)
              } catch (error) {
                resolve(null)
              }
            });
          });        
        }
      }
    }
  }


  /** Calls a service method  */
  static callService(service, method, keys, data=true) {
    if (!service) throw new TypeError("The service parameter is missing.")
    if (!method) throw new TypeError("The method parameter is missing.")
    if (!keys) throw new TypeError("The keys parameter is missing.")
    if (!Array.isArray(keys)) keys = [keys]

    return async(context) => {
      if (!context.app) throw new Error("The app object was not attached to the context.")
      let svc = context.app.service(service)
      let params = {}
      let keysfound = 0
      if (typeof svc[method] !== "function") 
        throw new TypeError(`The method ${method} was nto found in service ${service}.`)

      if (context.request.params) {
        for(let key of keys) {
          if (context.request.params[key]) {
            params[key] = context.request.params[key]
            keysfound++
          }
        }
      }

      if (context.response) {
        if (keysfound < keys.length && context.response.data) {
          if (Array.isArray(context.response.data)) {
            if (context.response.data.length > 0) {
              // for array check first record
              for(let key of keys) {
                if (!params[key] && context.response.data[0][key]) {
                  params[key] = context.response.data[0][key]
                  keysfound++
                }
              }  
            }
          } else {
            for(let key of keys) {
              if (!params[key] && context.response.data[key]) {
                params[key] = context.response.data[key]
                keysfound++
              }
            }  
          }
        }
        if (keysfound == keys.length) {
          let fn = svc[method].bind(svc)
          let result = await fn(params)
          if (data) context.response.data = result
        } else {
          throw new Error(`Unable to find all key fields in callService(${service}, ${method}) method.`)
        }
      }
    }
  }  


  static getServiceField(service, key, field) {
    return async (context) => {
      if (!context || !context.response || !context.response.data)
        return
        //throw new Error("No response data exists.")
  
      let svc = context.app.service(service)
      let fn = svc.get.bind(svc)
      if (Array.isArray(context.response.data)) {
        for(let i=0; i < context.response.data.length; i++) {
          let params = {}
          params[key] = context.response.data[i][key]
          let data = await fn(params)
          if (data[field]) context.response.data[i][field]=data[field]
          //else throw new Error(`The field ${field} was not found.`)  
        }
      } else {
        let params = {}
        params[key] = context.response.data[key]
        let data = await fn(params)
        if (data[field]) context.response.data[field]=data[field]
        //else throw new Error(`The field ${field} was not found.`)
      }
    }  
  }
  

  static broadcaster(prefix, key, sep = "/") {
    return async(context) => {
      if (context.response && context.response.data) {
        if (Array.isArray(context.response.data)) {
          for(let i=0; i < context.response.data.length; i++) {
            if (context.response.data[i][key]) {
              let channel = `${prefix}${sep}${context.response.data[i][key]}`
              context.app.channel(channel).broadcast(context)  
              break
            }
          }
        } else if (context.response.data[key]) {
          let channel = `${prefix}${sep}${context.response.data[key]}`
          context.app.channel(channel).broadcast(context)  
        }
      }
    }
  }


  /** Renames a response field */
  static renameField = (fromField, toField) => {
    return async(context) => {
      if (context && context.response && context.response.data) {
        if (Array.isArray(context.response.data)) {
          for(let data of context.response.data) {
            if (fromField in data) {
              data[toField] = data[fromField]
              delete data[fromField]
            }
          }
        } else {
          if (fromField in context.response.data) {
            context.response.data[toField] = context.response.data[fromField]
            delete context.response.data[fromField]
          }
        }
      }
    }
  } 

  /** Copies a response field */
  static copyField = (fromField, toField) => {
    return async(context) => {
      if (context && context.response && context.response.data) {
        if (Array.isArray(context.response.data)) {
          for(let data of context.response.data) {
            if (fromField in data) {
              data[toField] = data[fromField]
            }
          }
        } else {
          if (fromField in context.response.data) {
            context.response.data[toField] = context.response.data[fromField]
          }
        }
      }
    }
  } 

}

class SockrBeforeHooks {

  /** Adds an startTime (Date) property of the response header */
  static addStartTime = () => {
    return async(context) => {
      if (context) {
        if (context.request && context.request.header) {
          context.request.header.startTime = new Date()
        }
        if (context.response && context.response.header) {
          context.response.header.startTime = new Date()          
        }
      }
    }
  }

  /** Converts fields with date strings to Date objects */
  static parseDates(fields) {
    if (!fields || fields.length == 0) throw new TypeError("Must pass a list of fields")
    return async(context) => {
      if (context && context.request && context.request.params) {
        if (Array.isArray(context.request.params)) {
          for(let i=0; i < context.request.params.length;i++) {
            for(let f of fields) {
              if (typeof context.request.params[i][f] === "string") {
                try {
                  let dt = dayjs(context.request.params[i][f])
                  dt = dt.toDate()
                  if (!isNaN(dt.getTime()))
                    context.request.params[i][f] = dt                  
                } catch { }
              }              
            }  
          }
        } else {
          for(let f of fields) {
            if (typeof context.request.params[f] === "string") {
              try {
                let dt = dayjs(context.request.params[f])
                dt = dt.toDate()
                if (!isNaN(dt.getTime()))
                  context.request.params[f] = dt                  
              } catch { }
            }  
          }
        }
      }
    }
  }

  /** Adds an authentication field to the request parameters  */
  static addAuthToParam(authProperty, authField, paramField) {
    if (!authProperty) throw new TypeError("The authProperty is missing.")
    if (!authField) throw new TypeError("The authField is missing.")
    if (!paramField) throw new TypeError("The paramField is missing.")

    return async(context) => {
      if (context && context.client && context.client[authProperty]) {
        if (!context.request.params) context.request.params = { }
        let val = loget(context.client[authProperty], authField)
        if (val !== undefined) loset(context.request.params, paramField, val)
      }
    }
  }

  static addParam(field, value) {
    if (!field) throw new TypeError("The field is missing.")
    if (!value) throw new TypeError("The value is missing.")
    return async(context) => {
      if (!context.request.params) context.request.params = { }
      loset(context.request.params, field, value)
    } 
  }  

  /** Removes the specified fields from the request parameters */
  static stripParams(fields) {
    if (!fields || fields.length == 0) throw new TypeError("Must pass a list of fields")
    return async(context) => {
      if (context && context.request && context.request.params) {
        if (Array.isArray(context.request.params)) {
          for(let i=0; i < context.request.params.length;i++) {
            for(let f of fields) {
              delete context.request.params[i][f]
            }  
          }
        } else {
          for(let f of fields) {
            delete context.request.params[f]
          }
        }
      }
    }
  }

  /** Gets a value from Redis cache using key fields from the request parameters */
  static getCache(redis, prefix, keys, sep) {
    if (!redis) throw new TypeError("The redis parameter is missing.")
    if (typeof redis.get !== "function") TypeError("The redis parameter must be an instance of RedisClient.")
    if (!prefix) throw new TypeError("The prefix parameter is missing.")
    if (!keys) throw new TypeError("The keys parameter is missing.")
    if (!Array.isArray(keys)) keys = [keys]
    if (!sep) sep = "-"

    return async(context) => {
      if (context && context.request && context.request.params) {
        let items = [prefix]
        for(let key of keys) {
          if (!context.request.params[key]) return
          items.push(context.request.params[key])
        }
        let key = items.join("-")

        return new Promise( (resolve,reject) => {
          redis.get(key, function(err, res) {
            if (err) resolve(null)
            else if (res) {
              context.response.data = JSON.parse(res);
              context.response.cached = true
              resolve(res)
            } else resolve(null)
          });
        });


      }
    }
  }
  
  /** Sets a Date field to the request parameters if it is undefined 
      using the seconds as an offset from the current time  */
  static setDate = (field, seconds=0, onlyIfMissing=true) => {
    if (!field) throw new TypeError("The field parameter is required.")
    if (!seconds) throw new TypeError("The seconds parameter is required.")
    if (onlyIfMissing) {
      return async(context) => {
        if (context && context.request) {
          if (!context.request.params) context.request.params = {}
          if (context.request.params[field] === undefined) {
            var i = Date.now()
            context.request.params[field] = new Date(i+seconds*1000);
          }
        }
      }  
    } else {
      return async(context) => {
        if (context && context.request) {
          if (!context.request.params) context.request.params = {}
          var i = Date.now()
          context.request.params[field] = new Date(i+seconds*1000);
        }
      }  
    }
  }


  /** Only accepts requests for these methods. Rejects all others. */
  static acceptMethods(methods) {
    if (!methods) throw new TypeError("One or more methods are required.")
    let set = new Set()
    if (Array.isArray(methods)) {
      for(let m of methods) set.add(m)
    } else if (typeof methods === "string") {
      set.add(method)
    } else {
      throw new TypeError("The methods must be a string or array.")
    }

    return async(context) => {      
      if (context && context.request && context.request.header) {
        let method = context.request.header.method
        if (method) {
          if (set.has(method)) return true
          throw new TypeError(`The method ${method} is not allowed.`)
        } 
      }
      throw new TypeError("A valid request method was not found.")
    }  
  }

  /** Rejects requests for these methods. Accepts all others. */
  static rejectMethods(methods) {
    if (!methods) throw new TypeError("One or more methods are required.")
    let set = new Set()
    if (Array.isArray(methods)) {
      for(let m of methods) set.add(m)
    } else if (typeof methods === "string") {
      set.add(method)
    } else {
      throw new TypeError("The methods must be a string or array.")
    }
        
    return async(context) => {
      if (context && context.request && context.request.header) {
        let method = context.request.header.method
        if (method && set.has(method)) {
          throw new TypeError(`The method ${method} is not allowed.`)
        }
      }
      return true
    }  
  }

  
}


class SockrHookUtils {
  static after = SockrAfterHooks
  static before = SockrBeforeHooks

}

module.exports = SockrHookUtils
module.exports.SockrHookUtils = SockrHookUtils
module.exports.SockrAfterHooks = SockrAfterHooks
module.exports.SockrBeforeHooks = SockrBeforeHooks
