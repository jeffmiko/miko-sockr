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
    if (!fields || fields.length > 0) throw new TypeError("Must pass a list of fields")
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
    if (!fields || fields.length > 0) throw new TypeError("Must pass a list of fields")
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
    if (!fields || fields.length > 0) throw new TypeError("Must pass a list of fields")
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
    if (!fields || fields.length > 0) throw new TypeError("Must pass a list of fields")
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

  /** Removes the specified fields from the request parameters */
  static stripParams(fields) {
    if (!fields || fields.length > 0) throw new TypeError("Must pass a list of fields")
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
    if (typeof redis.del !== "function") TypeError("The redis parameter must be an instance of RedisClient.")
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
  

}


class SockrHookUtils {
  static after = SockrAfterHooks
  static before = SockrBeforeHooks

}

module.exports = SockrHookUtils
module.exports.SockrHookUtils = SockrHookUtils
module.exports.SockrAfterHooks = SockrAfterHooks
module.exports.SockrBeforeHooks = SockrBeforeHooks
