const Redis = require("ioredis");

// Configura il client Redis con il tuo endpoint pubblico
const redis = new Redis({
    host: process.env.REDIS_URL,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
    tls: false, // Abilita TLS per endpoint pubblici
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
      console.log(`Dato memorizzato nella cache con chiave: ${key}`);
    } catch (err) {
      console.error("Errore durante il caching:", err);
      throw new Error(err);
    }
  }

  async function quickCacheData(key, value) {
    try {
      await redis.set(key, JSON.stringify(value), "EX", 60); // Scadenza
      console.log(`Dato memorizzato nella cache con chiave: ${key}`);
    } catch (err) {
      console.error("Errore durante il caching:", err);
      throw new Error(err);
    }
  }

  async function getData(key) {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.error("Errore durante il recupero dalla cache:", err);
      throw new Error(err);
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
  

module.exports = {redis, cacheData, quickCacheData, getData, deleteData};