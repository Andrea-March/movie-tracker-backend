const Redis = require("ioredis");

let retries = 0;
const MAX_RETRIES = 5;
// Configura il client Redis con il tuo endpoint pubblico
const redis = new Redis({
    host: process.env.REDIS_URL,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
    tls: false, // Abilita TLS per endpoint pubblici
    retryStrategy(times) { // Riprova dopo un tempo esponenziale
      if(retries > MAX_RETRIES) return
      retries = retries + 1
      const delay = Math.min(times * 50, 2000);
      console.log(`Riconnessione a Redis in ${delay}ms...`);
      return delay;
    },
    maxRetriesPerRequest: 5, // Numero massimo di tentativi per una richiesta
    connectTimeout: 10000, // Timeout di connessione
  });

  redis.on("connect", () => {
    console.log("Connected to Redis");
  });
  
  redis.on("error", (err) => {
    console.error("Redis connection error:", err);
  });

  async function cacheData(key, value) {
    try {
      await redis.set(key, JSON.stringify(value), "EX", process.env.REDIS_EXP_TIME); // Scadenza
     /*  console.log(`Dato memorizzato nella cache con chiave: ${key}`); */
    } catch (err) {
      console.error("Errore durante il caching:", err);
      throw new Error(err);
    }
  }

  async function quickCacheData(key, value) {
    try {
      await redis.set(key, JSON.stringify(value), "EX", 60); // Scadenza
      /* console.log(`Dato memorizzato nella cache con chiave: ${key}`); */
    } catch (err) {
      console.error("Errore durante il caching:", err);
      /* throw new Error(err); */
    }
  }

  async function getData(key) {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.error("Errore durante il recupero dalla cache:", err);
      /* throw new Error(err); */
    }
  }

  async function deleteData(key) {
    try {
      const result = await redis.del(key);
      if (result === 1) {
        console.log(`Chiave '${key}' eliminata dalla cache.`);
      } else {
        console.log(`Chiave '${key}' non trovata nella cache.`);
      }
    } catch (err) {
      console.error("Errore durante l'eliminazione della chiave:", err);
      throw new Error(err);
    }
  }

  async function cacheDataForUser(userId, key, value, expiry = process.env.REDIS_EXP_TIME) {
    try {
      await redis.set(key, JSON.stringify(value), "EX", expiry); // Salva i dati nella cache
      await redis.sadd(`cache_keys:${userId}`, key); // Aggiungi la chiave al set dell'utente
    } catch (err) {
      console.error("Errore durante l'aggiunta alla cache:", err);
      /* throw new Error(err); */
    }
  }

  async function deleteCacheKeysForUser(userId) {
    try {
      const keys = await redis.smembers(`cache_keys:${userId}`);
      if (keys.length > 0) {
        await redis.del(keys); // Elimina tutte le chiavi utente
        /* console.log(`Chiavi ${keys} eliminate per l'utente ${userId}`); */
      }
      await redis.del(`cache_keys:${userId}`); // Elimina il set stesso
      /* console.log(`Set di chiavi eliminato per l'utente ${userId}`); */
    } catch (err) {
      console.error("Errore durante l'eliminazione delle chiavi:", err);
      throw new Error(err);
    }
  }
  

module.exports = {redis, cacheData, quickCacheData, getData, deleteData, cacheDataForUser, deleteCacheKeysForUser};