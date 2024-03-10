// Redis client
import { createClient } from 'redis';
import { promisify } from 'util';

/**
 * Redis client class
 */
class RedisClient {
  constructor() {
    // create a new client
    this.client = createClient()
      // handle redis client error
      .on('error', (err) => {
        console.log(`${err}`);
      });
    // promisify the get, set and del methods
    this.getAsync = promisify(this.client.get).bind(this.client);
    this.setAsync = promisify(this.client.set).bind(this.client);
    this.delAsync = promisify(this.client.del).bind(this.client);
  }

  /**
   * Returns true when connection to Redis client is successful.
   * Otherwise returns false.
   * @returns {Boolean}
   */
  isAlive() {
    return this.client.connected;
  }

  /**
   * Returns a Promise that resolves with the Redis value stored for given key.
   * @param {String} key The key of the item to retrieve.
   * @returns {Promise<String | null>} Value of the item stored at key.
   */
  async get(key) {
    return this.getAsync(key);
  }

  /**
   * Stores key-value pair in Redis with expiration time of duration seconds.
   * @param {String} key The key of the item to set.
   * @param {String} value The value of the item to set.
   * @param {Number} duration The expiration time of the key in seconds.
   * @returns {Promise<String>} Simple string reply.
   */
  async set(key, value, duration) {
    return this.setAsync(key, value, 'EX', duration);
  }

  /**
   * Removes the value stored for given key from Redis.
   * @param {String} key
   * @returns {Promise<Number>} The number of keys that were removed.
   */
  async del(key) {
    return this.delAsync(key);
  }
}

const redisClient = new RedisClient();
export default redisClient;
