// App controller for express router
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

/**
 * Handles express server `/status` & `/stats` endpoints.
 */
class AppController {
  /**
   * Checks if both Redis and Db clients are alive.
   * @param {Request} req request to server
   * @param {Response} res response from server
   */
  static getStatus(req, res) {
    if (redisClient.isAlive() && dbClient.isAlive()) {
      res.send({ redis: true, db: true });
    }
  }

  /**
   * Returns the number of users and files in DB.
   * @param {Request} req request to server
   * @param {Response} res response from server
   */
  static getStats(req, res) {
    // after both promises resolve return result
    Promise.all([dbClient.nbUsers(), dbClient.nbFiles()])
      .then(([users, files]) => {
        res.send({ users, files });
      });
  }
}

export default AppController;
