// Authentication controller for express server
import { v4 as uuidv4 } from 'uuid'; import sha1 from 'sha1';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

/**
 * Handles `/connect` & `/disconnect` endpoints.
 */
class AuthController {
  /**
   * Signs-in the user based on email and password
   * by generating a new authentication token.
   * @param {Request} req request to server
   * @param {Response} res response from server
   */
  static async getConnect(req, res) {
    // get value of Authorization header (`Basic <base64value>`)
    // where <base64value> is the Base64 of the <email>:<password>
    const autHeader = req.get('Authorization') || ''; // if undefined set to ''
    // get the base64value part (after the leading `Basic `)
    const base64Value = autHeader.split(' ')[1] || ''; // if undefined set to ''
    // decode from base64 to utf
    const decodedValue = Buffer.from(base64Value, 'base64').toString('utf-8');
    // get email & password
    const [email, password] = decodedValue.split(':');
    if (!(email && password)) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }
    // hash given password & search user
    const hashedPassword = sha1(password);
    const user = await dbClient.db.collection('users')
      .findOne({ email, password: hashedPassword });
    if (!user) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }

    // create token
    const token = uuidv4();
    const key = `auth_${token}`; // for storing in redis
    // store the user id in redis with 24hrs expiration time
    const userId = user._id.toString(); // convert ObjectId to string
    await redisClient.set(key, userId, 24 * 3600);

    res.send({ token });
  }

  /**
   * Signs-out the user based on the token.
   * @param {Request} req request to server
   * @param {Response} res response from server
   */
  static async getDisconnect(req, res) {
    // get token from X-Token header in request
    const token = req.get('X-Token');
    if (!token) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }
    const key = `auth_${token}`;
    // retrive user id from redis
    const userId = await redisClient.get(key);
    if (!userId) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }
    // delete token from redis
    await redisClient.del(key);
    res.status(204).send();
  }
}

export default AuthController;
